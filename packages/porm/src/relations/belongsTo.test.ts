import { db } from '../test-utils/test-db';
import {
  AssertEqual,
  chatData,
  expectSql,
  messageData,
  profileData,
  userData,
  useTestDatabase,
} from '../test-utils/test-utils';
import { RelationQuery } from 'pqb';
import { User } from '../test-utils/test-models';

describe('belongsTo', () => {
  useTestDatabase();

  describe('querying', () => {
    it('should have method to query related data', async () => {
      const userQuery = db.user.take();
      type UserQuery = typeof userQuery;

      const eq: AssertEqual<
        typeof db.profile.user,
        RelationQuery<'user', { userId: number | null }, never, UserQuery, true>
      > = true;

      expect(eq).toBe(true);

      const { id: userId } = await db.user.select('id').insert(userData);
      const { id: profileId } = await db.profile
        .select('id')
        .insert({ ...profileData, userId });

      const profile = await db.profile.find(profileId);
      const query = db.profile.user(profile);

      expectSql(
        query.toSql(),
        `
        SELECT * FROM "user"
        WHERE "user"."id" = $1
        LIMIT $2
      `,
        [userId, 1],
      );

      const user = await query;

      expect(user).toMatchObject(userData);
    });

    it('should have proper joinQuery', () => {
      expectSql(
        db.profile.relations.user.joinQuery.toSql(),
        `
        SELECT * FROM "user"
        WHERE "user"."id" = "profile"."userId"
      `,
      );
    });

    it('should be supported in whereExists', () => {
      expectSql(
        db.profile.whereExists('user').toSql(),
        `
        SELECT * FROM "profile"
        WHERE EXISTS (
          SELECT 1 FROM "user"
          WHERE "user"."id" = "profile"."userId"
          LIMIT 1
        )
      `,
      );

      expectSql(
        db.profile
          .whereExists('user', (q) => q.where({ 'user.name': 'name' }))
          .toSql(),
        `
        SELECT * FROM "profile"
        WHERE EXISTS (
          SELECT 1 FROM "user"
          WHERE "user"."id" = "profile"."userId"
            AND "user"."name" = $1
          LIMIT 1
        )
      `,
        ['name'],
      );
    });

    it('should be supported in join', () => {
      const query = db.profile
        .join('user', (q) => q.where({ 'user.name': 'name' }))
        .select('bio', 'user.name');

      const eq: AssertEqual<
        Awaited<typeof query>,
        { bio: string | null; name: string }[]
      > = true;
      expect(eq).toBe(true);

      expectSql(
        query.toSql(),
        `
        SELECT "profile"."bio", "user"."name" FROM "profile"
        JOIN "user" ON "user"."id" = "profile"."userId" AND "user"."name" = $1
      `,
        ['name'],
      );
    });

    describe('select', () => {
      it('should be selectable', async () => {
        const query = db.profile.select(
          'id',
          db.profile.user.select('id', 'name').where({ 'user.name': 'name' }),
        );

        const eq: AssertEqual<
          Awaited<typeof query>,
          { id: number; user: { id: number; name: string } }[]
        > = true;
        expect(eq).toBe(true);

        expectSql(
          query.toSql(),
          `
            SELECT
              "profile"."id",
              (
                SELECT row_to_json("t".*) AS "json"
                FROM (
                  SELECT "user"."id", "user"."name" FROM "user"
                  WHERE "user"."id" = "profile"."userId"
                    AND "user"."name" = $1
                  LIMIT $2
                ) AS "t"
              ) AS "user"
            FROM "profile"
          `,
          ['name', 1],
        );
      });

      it('should be selectable by relation name', async () => {
        const query = db.profile.select('id', 'user');

        const eq: AssertEqual<
          Awaited<typeof query>,
          { id: number; user: User }[]
        > = true;
        expect(eq).toBe(true);

        expectSql(
          query.toSql(),
          `
            SELECT
              "profile"."id",
              (
                SELECT row_to_json("t".*) AS "json"
                FROM (
                  SELECT * FROM "user"
                  WHERE "user"."id" = "profile"."userId"
                  LIMIT $1
                ) AS "t"
              ) AS "user"
            FROM "profile"
          `,
          [1],
        );
      });
    });
  });

  describe('insert', () => {
    const checkInsertedResults = async ({
      messageId,
      chatId,
      authorId,
      text,
      title,
      name,
    }: {
      messageId: number;
      chatId: number;
      authorId: number | null;
      text: string;
      title: string;
      name: string;
    }) => {
      const message = await db.message.find(messageId);
      expect(message).toEqual({
        ...message,
        ...messageData,
        chatId,
        authorId,
        text,
      });

      const chat = await db.chat.find(chatId);
      expect(chat).toEqual({
        ...chat,
        ...chatData,
        title,
      });

      if (!authorId) return;
      const user = await db.user.find(authorId);
      expect(user).toEqual({
        ...user,
        ...userData,
        active: null,
        age: null,
        data: null,
        picture: null,
        name,
      });
    };

    it('should support create', async () => {
      const query = db.message.select('id', 'chatId', 'authorId').insert({
        ...messageData,
        text: 'message',
        chat: {
          create: {
            ...chatData,
            title: 'chat',
          },
        },
        user: {
          create: {
            ...userData,
            name: 'user',
          },
        },
      });

      const { id: messageId, chatId, authorId } = await query;

      await checkInsertedResults({
        messageId,
        chatId,
        authorId,
        text: 'message',
        title: 'chat',
        name: 'user',
      });
    });

    it('should support create many', async () => {
      const query = db.message.select('id', 'chatId', 'authorId').insert([
        {
          ...messageData,
          text: 'message 1',
          chat: {
            create: {
              ...chatData,
              title: 'chat 1',
            },
          },
          user: {
            create: {
              ...userData,
              name: 'user 1',
            },
          },
        },
        {
          ...messageData,
          text: 'message 2',
          chat: {
            create: {
              ...chatData,
              title: 'chat 2',
            },
          },
          user: {
            create: {
              ...userData,
              name: 'user 2',
            },
          },
        },
      ]);

      const [first, second] = await query;

      await checkInsertedResults({
        messageId: first.id,
        chatId: first.chatId,
        authorId: first.authorId,
        text: 'message 1',
        title: 'chat 1',
        name: 'user 1',
      });

      await checkInsertedResults({
        messageId: second.id,
        chatId: second.chatId,
        authorId: second.authorId,
        text: 'message 2',
        title: 'chat 2',
        name: 'user 2',
      });
    });

    it('should support connect', async () => {
      await db.chat.insert({ ...chatData, title: 'chat' });
      await db.user.insert({ ...userData, name: 'user' });

      const query = db.message.select('id', 'chatId', 'authorId').insert({
        ...messageData,
        text: 'message',
        chat: {
          connect: { title: 'chat' },
        },
        user: {
          connect: { name: 'user' },
        },
      });

      const { id: messageId, chatId, authorId } = await query;

      await checkInsertedResults({
        messageId,
        chatId,
        authorId,
        text: 'message',
        title: 'chat',
        name: 'user',
      });
    });

    it('should support connect many', async () => {
      await db.chat.insert([
        { ...chatData, title: 'chat 1' },
        { ...chatData, title: 'chat 2' },
      ]);
      await db.user.insert([
        { ...userData, name: 'user 1' },
        { ...userData, name: 'user 2' },
      ]);

      const query = db.message.select('id', 'chatId', 'authorId').insert([
        {
          ...messageData,
          text: 'message 1',
          chat: {
            connect: { title: 'chat 1' },
          },
          user: {
            connect: { name: 'user 1' },
          },
        },
        {
          ...messageData,
          text: 'message 2',
          chat: {
            connect: { title: 'chat 2' },
          },
          user: {
            connect: { name: 'user 2' },
          },
        },
      ]);

      const [first, second] = await query;

      await checkInsertedResults({
        messageId: first.id,
        chatId: first.chatId,
        authorId: first.authorId,
        text: 'message 1',
        title: 'chat 1',
        name: 'user 1',
      });

      await checkInsertedResults({
        messageId: second.id,
        chatId: second.chatId,
        authorId: second.authorId,
        text: 'message 2',
        title: 'chat 2',
        name: 'user 2',
      });
    });

    it('should support connect or create', async () => {
      const chat = await db.chat.select('id').insert({
        ...chatData,
        title: 'chat',
      });

      const query = await db.message.select('id', 'chatId', 'authorId').insert({
        ...messageData,
        text: 'message',
        chat: {
          connect: { title: 'chat' },
          create: { ...chatData, title: 'chat' },
        },
        user: {
          connect: { name: 'user' },
          create: { ...userData, name: 'user' },
        },
      });

      const { id: messageId, chatId, authorId } = await query;

      expect(chatId).toBe(chat.id);

      await checkInsertedResults({
        messageId,
        chatId,
        authorId,
        text: 'message',
        title: 'chat',
        name: 'user',
      });
    });

    it('should support connect or create many', async () => {
      const chat = await db.chat.select('id').insert({
        ...chatData,
        title: 'chat 1',
      });
      const user = await db.user.select('id').insert({
        ...userData,
        name: 'user 2',
      });

      const query = await db.message.select('id', 'chatId', 'authorId').insert([
        {
          ...messageData,
          text: 'message 1',
          chat: {
            connect: { title: 'chat 1' },
            create: { ...chatData, title: 'chat 1' },
          },
          user: {
            connect: { name: 'user 1' },
            create: { ...userData, name: 'user 1' },
          },
        },
        {
          ...messageData,
          text: 'message 2',
          chat: {
            connect: { title: 'chat 2' },
            create: { ...chatData, title: 'chat 2' },
          },
          user: {
            connect: { name: 'user 2' },
            create: { ...userData, name: 'user 2' },
          },
        },
      ]);

      const [first, second] = await query;

      expect(first.chatId).toBe(chat.id);
      expect(second.authorId).toBe(user.id);

      await checkInsertedResults({
        messageId: first.id,
        chatId: first.chatId,
        authorId: first.authorId,
        text: 'message 1',
        title: 'chat 1',
        name: 'user 1',
      });

      await checkInsertedResults({
        messageId: second.id,
        chatId: second.chatId,
        authorId: second.authorId,
        text: 'message 2',
        title: 'chat 2',
        name: 'user 2',
      });
    });
  });

  describe('update', () => {
    describe('disconnect', () => {
      it('should nullify foreignKey', async () => {
        const { id } = await db.profile
          .select('id')
          .insert({ ...profileData, user: { create: userData } });

        const profile = await db.profile
          .select('userId')
          .find(id)
          .update({
            bio: 'string',
            user: { disconnect: true },
          });

        expect(profile.userId).toBe(null);
      });
    });

    describe('set', () => {
      it('should set foreignKey of current record with provided primaryKey', async () => {
        const { id } = await db.profile.select('id').insert(profileData);
        const user = await db.user.select('id').insert(userData);

        const profile = await db.profile
          .selectAll()
          .find(id)
          .update({
            user: {
              set: user,
            },
          });

        expect(profile.userId).toBe(user.id);
      });

      it('should set foreignKey of current record from found related record', async () => {
        const { id } = await db.profile.select('id').insert(profileData);
        const user = await db.user.select('id').insert({
          ...userData,
          name: 'user',
        });

        const profile = await db.profile
          .selectAll()
          .find(id)
          .update({
            user: {
              set: { name: 'user' },
            },
          });

        expect(profile.userId).toBe(user.id);
      });
    });

    describe('delete', () => {
      it('should nullify foreignKey and delete related record', async () => {
        const { id, userId } = await db.profile
          .select('id', 'userId')
          .insert({ ...profileData, user: { create: userData } });

        const profile = await db.profile
          .select('userId')
          .find(id)
          .update({
            user: {
              delete: true,
            },
          });

        expect(profile.userId).toBe(null);

        const user = await db.user.findByOptional({ id: userId });
        expect(user).toBe(undefined);
      });
    });

    describe('nested update', () => {
      it('should update related record', async () => {
        const { id, userId } = await db.profile
          .select('id', 'userId')
          .insert({ ...profileData, user: { create: userData } });

        await db.profile
          .select('userId')
          .find(id)
          .update({
            user: {
              update: {
                name: 'new name',
              },
            },
          });

        const user = await db.user.findBy({ id: userId });
        expect(user.name).toBe('new name');
      });
    });

    describe('nested upsert', () => {
      it('should update related record if it exists', async () => {
        const profile = await db.profile.create({
          ...profileData,
          user: {
            create: userData,
          },
        });

        await db.profile.find(profile.id).update({
          user: {
            upsert: {
              update: {
                name: 'updated',
              },
              create: userData,
            },
          },
        });

        const user = await db.profile.user(profile);
        expect(user.name).toBe('updated');
      });

      it('should create related record if it does not exist', async () => {
        const profile = await db.profile.create(profileData);

        const updated = await db.profile
          .selectAll()
          .find(profile.id)
          .update({
            user: {
              upsert: {
                update: {
                  name: 'updated',
                },
                create: {
                  ...userData,
                  name: 'created',
                },
              },
            },
          });

        const user = await db.profile.user(updated);
        expect(user.name).toBe('created');
      });
    });
  });
});
