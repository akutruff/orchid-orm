import { createBaseTable } from './baseTable';
import { orchidORM } from './orm';
import { ColumnType, Operators } from 'pqb';
import { BaseTable, db, userData, useTestORM } from './test-utils/test-utils';
import path from 'path';
import { asMock } from './codegen/testUtils';
import { getCallerFilePath } from 'orchid-core';
import { assertType, expectSql, testAdapter } from 'test-utils';

jest.mock('orchid-core', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require('path');
  const actual = jest.requireActual('../../core/src');
  return {
    ...actual,
    getCallerFilePath: jest.fn(() =>
      path.join(__dirname, 'test-utils', 'test-tables.ts'),
    ),
  };
});

describe('baseTable', () => {
  useTestORM();

  it('should have `exportAs`', () => {
    expect(BaseTable.exportAs).toBe('BaseTable');
  });

  it('should allow to customize a name', () => {
    const base = createBaseTable({
      exportAs: 'custom',
    });
    expect(base.exportAs).toBe('custom');
  });

  it('should have a getFilePath method to return a path where the baseTable is defined', () => {
    expect(BaseTable.getFilePath()).toBe(
      path.join(__dirname, 'test-utils', 'test-tables.ts'),
    );
  });

  it('should throw if cannot determine file path and calling `getFilePath', () => {
    asMock(getCallerFilePath).mockReturnValueOnce(undefined);

    expect(() => createBaseTable().getFilePath()).toThrow(
      'Failed to determine file path',
    );
  });

  describe('overriding column types', () => {
    it('should have .sql with overridden types', () => {
      class Type extends ColumnType {
        dataType = 'type';
        operators = Operators.any;
        toCode() {
          return '';
        }
      }
      const type = new Type();
      const BaseTable = createBaseTable({ columnTypes: { type: () => type } });
      class UserTable extends BaseTable {
        readonly table = 'user';
        columns = this.setColumns((t) => ({
          id: t.type().primaryKey(),
          createdAt: t.type(),
        }));
      }

      const { user } = orchidORM(
        { adapter: testAdapter },
        {
          user: UserTable,
        },
      );

      const value = user.sql((t) => t.type())``;

      expect(value.__column).toBe(type);
    });

    it('should return date as string by default', async () => {
      await db.user.create(userData);

      const BaseTable = createBaseTable();
      class UserTable extends BaseTable {
        readonly table = 'user';
        columns = this.setColumns((t) => ({
          id: t.identity().primaryKey(),
          createdAt: t.timestamp(),
        }));
      }

      const { user } = orchidORM(
        { adapter: testAdapter },
        {
          user: UserTable,
        },
      );

      const result = await user.get('createdAt');
      expect(typeof result).toBe('string');

      assertType<typeof result, string>();
    });

    it('should return date as Date when overridden', async () => {
      await db.user.create(userData);

      const BaseTable = createBaseTable({
        columnTypes: (t) => ({
          identity: t.identity,
          timestamp() {
            return t.timestamp().parse((input) => new Date(input));
          },
        }),
      });

      class UserTable extends BaseTable {
        readonly table = 'user';
        columns = this.setColumns((t) => ({
          id: t.identity().primaryKey(),
          createdAt: t.timestamp(),
        }));
      }

      const { user } = orchidORM(
        { adapter: testAdapter },
        {
          user: UserTable,
        },
      );

      const result = await user.get('createdAt');
      expect(result instanceof Date).toBe(true);

      assertType<typeof result, Date>();
    });
  });

  describe('noPrimaryKey', () => {
    it('should allow to the table to not have a primary key', () => {
      class UserTable extends BaseTable {
        readonly table = 'user';
        noPrimaryKey = true;
        columns = this.setColumns((t) => ({
          name: t.text(),
        }));
      }

      orchidORM(
        {
          adapter: testAdapter,
        },
        {
          user: UserTable,
        },
      );
    });
  });

  describe('snake case', () => {
    it('should translate columns to snake case, use snake case timestamps, with respect to existing names', () => {
      const BaseTable = createBaseTable({
        snakeCase: true,
      });

      class UserTable extends BaseTable {
        readonly table = 'user';
        columns = this.setColumns((t) => ({
          id: t.identity().primaryKey(),
          camelCase: t.name('camelCase').integer(),
          snakeCase: t.integer(),
          ...t.timestamps(),
        }));
      }

      const db = orchidORM(
        {
          adapter: testAdapter,
        },
        {
          user: UserTable,
        },
      );

      expect(db.user.shape.camelCase.data.name).toBe('camelCase');
      expect(db.user.shape.snakeCase.data.name).toBe('snake_case');
      expect(db.user.shape.createdAt.data.name).toBe('created_at');
      expect(db.user.shape.updatedAt.data.name).toBe('updated_at');
    });

    it('should add timestamps with snake case names when snakeCase option is set to true on the table class', () => {
      const BaseTable = createBaseTable();

      class UserTable extends BaseTable {
        readonly table = 'user';
        snakeCase = true;
        columns = this.setColumns((t) => ({
          id: t.identity().primaryKey(),
          camelCase: t.name('camelCase').integer(),
          snakeCase: t.integer(),
          ...t.timestamps(),
        }));
      }

      const db = orchidORM(
        {
          adapter: testAdapter,
        },
        {
          user: UserTable,
        },
      );

      expect(db.user.shape.camelCase.data.name).toBe('camelCase');
      expect(db.user.shape.snakeCase.data.name).toBe('snake_case');
      expect(db.user.shape.createdAt.data.name).toBe('created_at');
      expect(db.user.shape.updatedAt.data.name).toBe('updated_at');
    });
  });

  describe('nowSQL', () => {
    it('should produce custom SQL for timestamps when updating', () => {
      const BaseTable = createBaseTable({
        nowSQL: `now() AT TIME ZONE 'UTC'`,
      });

      class UserTable extends BaseTable {
        readonly table = 'user';
        columns = this.setColumns((t) => ({
          id: t.identity().primaryKey(),
          ...t.timestamps(),
        }));
      }

      const { user } = orchidORM(
        { adapter: testAdapter },
        {
          user: UserTable,
        },
      );

      expectSql(
        user.find(1).update({}).toSql(),
        `
          UPDATE "user" SET "updatedAt" = (now() AT TIME ZONE 'UTC') WHERE "user"."id" = $1
        `,
        [1],
      );
    });
  });

  describe('hooks', () => {
    it('should set hooks in the init', async () => {
      const fns = {
        beforeQuery: () => {},
        afterQuery: () => {},
        beforeCreate: () => {},
        afterCreate: () => {},
        afterCreateCommit: () => {},
        beforeUpdate: () => {},
        afterUpdate: () => {},
        afterUpdateCommit: () => {},
        beforeDelete: () => {},
        afterDelete: () => {},
        afterDeleteCommit: () => {},
        beforeSave: () => {},
        afterSave: () => {},
        afterSaveCommit: () => {},
      };

      let initArg: unknown | undefined;

      class Table extends BaseTable {
        readonly table = 'table';
        columns = this.setColumns((t) => ({
          id: t.identity().primaryKey(),
          one: t.text(),
          two: t.text(),
          three: t.text(),
          four: t.text(),
          five: t.text(),
          six: t.text(),
          seven: t.text(),
          eight: t.text(),
        }));

        init(orm: typeof db) {
          this.beforeQuery(fns.beforeQuery);
          this.beforeCreate(fns.beforeCreate);
          this.beforeUpdate(fns.beforeUpdate);
          this.beforeDelete(fns.beforeDelete);
          this.beforeSave(fns.beforeSave);
          this.afterQuery(fns.afterQuery);
          this.afterCreate(['one'], fns.afterCreate);
          this.afterCreateCommit(['two'], fns.afterCreateCommit);
          this.afterUpdate(['three'], fns.afterUpdate);
          this.afterUpdateCommit(['four'], fns.afterUpdateCommit);
          this.afterDelete(['five'], fns.afterDelete);
          this.afterDeleteCommit(['six'], fns.afterDeleteCommit);
          this.afterSave(['seven'], fns.afterSave);
          this.afterSaveCommit(['eight'], fns.afterSaveCommit);

          initArg = orm;
        }
      }

      const db = orchidORM(
        { adapter: testAdapter },
        {
          table: Table,
          chair: Table,
        },
      );

      expect(initArg).toBe(db);

      expect(db.table.baseQuery.query).toMatchObject({
        before: [fns.beforeQuery],
        after: [fns.afterQuery],
        beforeCreate: [fns.beforeCreate, fns.beforeSave],
        afterCreate: [fns.afterCreate, fns.afterSave],
        afterCreateCommit: [fns.afterCreateCommit, fns.afterSaveCommit],
        afterCreateSelect: ['one', 'two', 'seven', 'eight'],
        beforeUpdate: [fns.beforeUpdate, fns.beforeSave],
        afterUpdate: [fns.afterUpdate, fns.afterSave],
        afterUpdateCommit: [fns.afterUpdateCommit, fns.afterSaveCommit],
        afterUpdateSelect: ['three', 'four', 'seven', 'eight'],
        beforeDelete: [fns.beforeDelete],
        afterDelete: [fns.afterDelete],
        afterDeleteCommit: [fns.afterDeleteCommit],
        afterDeleteSelect: ['five', 'six'],
      });
    });
  });
});
