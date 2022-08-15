import {
  AssertEqual,
  expectQueryNotMutated,
  expectSql,
  insert,
  User,
  useTestDatabase,
} from '../test-utils';
import { columnTypes } from '../columnSchema';

describe('json methods', () => {
  useTestDatabase();

  describe('json', () => {
    it('wraps a query with json functions', () => {
      const q = User.all();
      expectSql(
        q.json().toSql(),
        `
          SELECT COALESCE(json_agg(row_to_json("t".*)), '[]') AS "json"
          FROM (
            SELECT "user".* FROM "user"
          ) AS "t"
        `,
      );
      expectQueryNotMutated(q);
    });

    it('supports `take`', () => {
      const q = User.all();
      expectSql(
        q.take().json().toSql(),
        `
          SELECT COALESCE(row_to_json("t".*), '{}') AS "json"
          FROM (
            SELECT "user".* FROM "user" LIMIT $1
          ) AS "t"
        `,
        [1],
      );
      expectQueryNotMutated(q);
    });
  });

  describe('processing and selecting json data', () => {
    beforeEach(async () => {
      const now = new Date();
      await insert('user', {
        id: 1,
        name: 'name',
        password: 'password',
        picture: null,
        data: `{"name": "value", "tags": ["one"]}`,
        createdAt: now,
        updatedAt: now,
      });
    });

    describe('jsonSet', () => {
      it('should select json with updated property', async () => {
        const q = User.all();

        const query = q.jsonSet('data', ['name'], 'new value');
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_set("user"."data", '{name}', $1) AS "data"
            FROM "user"
          `,
          ['"new value"'],
        );

        const result = await query.take();
        expect(result.data).toEqual({ name: 'new value', tags: ['one'] });

        const eq: AssertEqual<
          typeof result.data,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });

      it('should accept optional `as`, `createIfMissing`', async () => {
        const q = User.all();

        const query = q.jsonSet('data', ['name'], 'new value', {
          as: 'alias',
          createIfMissing: true,
        });
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_set("user"."data", '{name}', $1, true) AS "alias"
            FROM "user"
          `,
          ['"new value"'],
        );

        const result = await query.take();
        expect(result.alias).toEqual({ name: 'new value', tags: ['one'] });

        const eq: AssertEqual<
          typeof result.alias,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });

      it('supports nesting', async () => {
        const q = User.all();

        const query = q.jsonSet(
          q.jsonInsert('data', ['tags', 0], 'two'),
          ['name'],
          'new value',
        );
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_set(
              jsonb_insert("user"."data", '{tags, 0}', $1),
              '{name}', $2
            ) AS "data"
            FROM "user"
          `,
          ['"two"', '"new value"'],
        );

        const result = await query.take();
        expect(result.data).toEqual({
          name: 'new value',
          tags: ['two', 'one'],
        });

        const eq: AssertEqual<
          typeof result.data,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });
    });

    describe('jsonInsert', () => {
      it('should select json with updated property', async () => {
        const q = User.all();

        const query = q.jsonInsert('data', ['tags', 0], 'two');
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_insert("user"."data", '{tags, 0}', $1) AS "data"
            FROM "user"
          `,
          ['"two"'],
        );

        const result = await query.take();
        expect(result.data).toEqual({ name: 'value', tags: ['two', 'one'] });

        const eq: AssertEqual<
          typeof result.data,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });

      it('should accept optional `as`, `insertAfter`', async () => {
        const q = User.all();

        const query = q.jsonInsert('data', ['tags', 0], 'two', {
          as: 'alias',
          insertAfter: true,
        });
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_insert("user"."data", '{tags, 0}', $1, true) AS "alias"
            FROM "user"
          `,
          ['"two"'],
        );

        const result = await query.take();
        expect(result.alias).toEqual({ name: 'value', tags: ['one', 'two'] });

        const eq: AssertEqual<
          typeof result.alias,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });

      it('supports nesting', async () => {
        const q = User.all();

        const query = q.jsonInsert(
          q.jsonSet('data', ['tags'], []),
          ['tags', 0],
          'tag',
        );
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_insert(
              jsonb_set("user"."data", '{tags}', $1),
              '{tags, 0}', $2
            ) AS "data"
            FROM "user"
          `,
          ['[]', '"tag"'],
        );

        const result = await query.take();
        expect(result.data).toEqual({ name: 'value', tags: ['tag'] });

        const eq: AssertEqual<
          typeof result.data,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });
    });

    describe('jsonRemove', () => {
      it('should select json with removed property', async () => {
        const q = User.all();

        const query = q.jsonRemove('data', ['tags', 0]);
        expectSql(
          query.toSql(),
          `
            SELECT "user"."data" #- '{tags, 0}' AS "data"
            FROM "user"
          `,
        );

        const result = await query.take();
        expect(result.data).toEqual({ name: 'value', tags: [] });

        const eq: AssertEqual<
          typeof result.data,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });

      it('should accept optional `as`', async () => {
        const q = User.all();

        const query = q.jsonRemove('data', ['tags', 0], { as: 'alias' });
        expectSql(
          query.toSql(),
          `
            SELECT "user"."data" #- '{tags, 0}' AS "alias"
            FROM "user"
          `,
        );

        const result = await query.take();
        expect(result.alias).toEqual({ name: 'value', tags: [] });

        const eq: AssertEqual<
          typeof result.alias,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });

      it('supports nesting', async () => {
        const q = User.all();

        const query = q.jsonRemove(q.jsonSet('data', ['tags'], ['tag']), [
          'tags',
          0,
        ]);
        expectSql(
          query.toSql(),
          `
            SELECT 
              jsonb_set("user"."data", '{tags}', $1) #- '{tags, 0}' AS "data"
            FROM "user"
          `,
          ['["tag"]'],
        );

        const result = await query.take();
        expect(result.data).toEqual({ name: 'value', tags: [] });

        const eq: AssertEqual<
          typeof result.data,
          { name: string; tags: string[] } | null
        > = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });
    });

    describe('selectJsonPathQuery', () => {
      it('should select json property', async () => {
        const q = User.all();

        const query = q.jsonPathQuery(
          columnTypes.text(),
          'data',
          '$.name',
          'name',
        );
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_path_query("user"."data", $1) AS "name"
            FROM "user"
          `,
          ['$.name'],
        );

        const result = await query.take();
        expect(result.name).toBe('value');

        const eq: AssertEqual<typeof result.name, string> = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });

      it('optionally supports vars and silent options', () => {
        const q = User.all();

        const query = q.jsonPathQuery(
          columnTypes.text(),
          'data',
          '$.name',
          'name',
          {
            vars: 'vars',
            silent: true,
          },
        );
        expectSql(
          query.toSql(),
          `
            SELECT jsonb_path_query("user"."data", $1, $2, true) AS "name"
            FROM "user"
          `,
          ['$.name', 'vars'],
        );

        expectQueryNotMutated(q);
      });

      it('supports nesting', async () => {
        const q = User.all();

        const query = q.jsonPathQuery(
          columnTypes.array(columnTypes.text()),
          q.jsonSet('data', ['tags'], ['tag']),
          '$.tags',
          'tags',
        );
        expectSql(
          query.toSql(),
          `
            SELECT 
              jsonb_path_query(
                jsonb_set("user"."data", '{tags}', $1),
                $2
              ) AS "tags"
            FROM "user"
          `,
          ['["tag"]', '$.tags'],
        );

        const result = await query.take();
        expect(result.tags).toEqual(['tag']);

        const eq: AssertEqual<typeof result.tags, string[]> = true;
        expect(eq).toBe(true);

        expectQueryNotMutated(q);
      });
    });
  });
});
