import {
  adapter,
  AssertEqual,
  db,
  expectSql,
  User,
  userData,
  useTestDatabase,
} from './test-utils';
import { createDb } from './db';
import { columnTypes } from './columnSchema';

describe('db', () => {
  useTestDatabase();

  it('supports table without schema', () => {
    const table = db('table');
    const query = table.select('id', 'name').where({ foo: 'bar' });
    expectSql(
      query.toSql(),
      `
        SELECT "table"."id", "table"."name" FROM "table"
        WHERE "table"."foo" = $1
      `,
      ['bar'],
    );
  });

  describe('overriding column types', () => {
    it('should return date as string by default', async () => {
      await User.insert(userData);

      const db = createDb({ adapter, columnTypes });
      const table = db('user', (t) => ({
        createdAt: t.timestamp(),
      }));

      const result = await table.take().get('createdAt');
      expect(typeof result).toBe('string');

      const eq: AssertEqual<typeof result, string> = true;
      expect(eq).toBe(true);
    });

    it('should return date as Date when overridden', async () => {
      await User.insert(userData);

      const db = createDb({
        adapter,
        columnTypes: {
          timestamp() {
            return columnTypes.timestamp().parse((input) => new Date(input));
          },
        },
      });
      const table = db('user', (t) => ({
        createdAt: t.timestamp(),
      }));

      const result = await table.take().get('createdAt');
      expect(result instanceof Date).toBe(true);

      const eq: AssertEqual<typeof result, Date> = true;
      expect(eq).toBe(true);
    });
  });
});
