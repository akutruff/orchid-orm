import { DbStructure } from './dbStructure';
import {
  Adapter,
  ArrayColumn,
  BigSerialColumn,
  CustomTypeColumn,
  DecimalColumn,
  DomainColumn,
  EnumColumn,
  IntegerColumn,
  SerialColumn,
  SmallSerialColumn,
  TextColumn,
  TimestampTZColumn,
  VarCharColumn,
} from 'pqb';
import { isRaw, raw, RawExpression } from 'orchid-core';
import { structureToAst, StructureToAstCtx } from './structureToAst';
import { RakeDbAst } from '../ast';
import { getIndexName } from '../migration/migrationUtils';
import {
  table,
  intColumn,
  varCharColumn,
  decimalColumn,
  timestampColumn,
  index,
  foreignKey,
  extension,
  enumType,
  primaryKey,
  check,
  domain,
  identityColumn,
  view,
} from './pull.test-utils';

const adapter = new Adapter({ databaseURL: 'file:path' });
const query = jest.fn().mockImplementation(() => ({ rows: [] }));
adapter.query = query;
adapter.arrays = query;

const columns = [
  { ...intColumn, name: 'id' },
  { ...intColumn, name: 'name', type: 'text' },
];

const ctx: StructureToAstCtx = {
  unsupportedTypes: {},
  snakeCase: false,
  currentSchema: 'custom',
};

const structure: {
  schemas: string[];
  tables: DbStructure.Table[];
  views: DbStructure.View[];
} = {
  schemas: [],
  tables: [],
  views: [],
};

DbStructure.prototype.getStructure = async () => structure;

describe('structureToAst', () => {
  beforeEach(() => {
    ctx.unsupportedTypes = {};
    ctx.snakeCase = false;
    structure.schemas.length =
      structure.tables.length =
      structure.views.length =
        0;
  });

  it('should add schema except public', async () => {
    const db = new DbStructure(adapter);
    structure.schemas = ['public', 'one', 'two'];

    const ast = await structureToAst(ctx, db);
    expect(ast).toEqual([
      {
        type: 'schema',
        action: 'create',
        name: 'one',
      },
      {
        type: 'schema',
        action: 'create',
        name: 'two',
      },
    ]);
  });

  describe('table', () => {
    it('should add table', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          schemaName: 'public',
          name: 'table',
          comment: 'comment',
          columns: [],
        },
      ];

      const ast = await structureToAst(ctx, db);

      expect(ast).toEqual([
        {
          type: 'table',
          action: 'create',
          schema: 'public',
          name: 'table',
          comment: 'comment',
          shape: {},
          noPrimaryKey: 'ignore',
          indexes: [],
          constraints: [],
        },
      ]);
    });

    it('should ignore current schema', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ schemaName: 'custom', name: 'table', columns: [] }];

      const ast = await structureToAst(ctx, db);

      expect(ast).toEqual([
        {
          type: 'table',
          action: 'create',
          name: 'table',
          shape: {},
          noPrimaryKey: 'ignore',
          indexes: [],
          constraints: [],
        },
      ]);
    });

    it('should ignore schemaMigrations table', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        { schemaName: 'public', name: 'schemaMigrations', columns: [] },
      ];

      const ast = await structureToAst(ctx, db);

      expect(ast).toEqual([]);
    });

    it('should add columns', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(Object.keys(ast.shape).length).toBe(columns.length);
      expect(ast.noPrimaryKey).toBe('ignore');
      expect(ast.shape.id).toBeInstanceOf(IntegerColumn);
      expect(ast.shape.name).toBeInstanceOf(TextColumn);
    });

    it('should rename column to camelCase and save original name in data.name', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        { ...table, columns: [{ ...intColumn, name: '__column__name__' }] },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.shape.columnName).toBeInstanceOf(IntegerColumn);
      expect(ast.shape.columnName.data.name).toBe('__column__name__');
    });

    it('should add array column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          columns: [
            {
              ...intColumn,
              type: 'int4',
              isArray: true,
            },
          ],
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.shape.column).toBeInstanceOf(ArrayColumn);
      expect(
        (ast.shape.column as ArrayColumn<IntegerColumn>).data.item,
      ).toBeInstanceOf(IntegerColumn);
    });

    it('should support enum column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          columns: [
            {
              ...intColumn,
              typeSchema: enumType.schemaName,
              type: enumType.name,
            },
          ],
        },
      ];
      db.getEnums = async () => [enumType];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.shape.column).toBeInstanceOf(EnumColumn);
      expect((ast.shape.column as EnumColumn).enumName).toBe(enumType.name);
      expect((ast.shape.column as EnumColumn).options).toBe(enumType.values);
    });

    it('should support column with check', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          columns: [intColumn],
        },
      ];
      db.getConstraints = async () => [check];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.shape.column.data.check).toEqual(raw(check.check.expression));
    });

    it('should support column of custom type', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          columns: [{ ...intColumn, type: 'customType' }],
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.shape.column).toBeInstanceOf(CustomTypeColumn);
      expect(ast.shape.column.dataType).toBe('customType');

      expect(ctx.unsupportedTypes).toEqual({
        customType: [
          `${intColumn.schemaName}.${intColumn.tableName}.${intColumn.name}`,
        ],
      });
    });

    it('should support column of domain type', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          columns: [
            {
              ...intColumn,
              type: domain.name,
              typeSchema: domain.schemaName,
              isArray: true,
            },
          ],
        },
      ];
      db.getDomains = async () => [domain];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      const array = ast.shape.column;
      expect(array).toBeInstanceOf(ArrayColumn);

      const column = (array as ArrayColumn<DomainColumn>).data.item;
      expect(column.dataType).toBe(domain.name);
      expect(column.data.as).toBeInstanceOf(IntegerColumn);
    });

    it('should wrap column default into raw', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          columns: [{ ...timestampColumn, default: 'now()' }],
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      const { default: def } = ast.shape.timestamp.data;
      expect(def && typeof def === 'object' && isRaw(def)).toBe(true);
      expect((def as RawExpression).__raw).toBe('now()');
    });

    it('should replace current_timestamp and transaction_timestamp() with now() in timestamp default', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          columns: [
            { ...timestampColumn, name: 'one', default: 'current_timestamp' },
            {
              ...timestampColumn,
              name: 'two',
              default: 'transaction_timestamp()',
            },
            { ...timestampColumn, name: 'three', default: 'now()' },
          ],
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect((ast.shape.one.data.default as RawExpression).__raw).toBe('now()');
      expect((ast.shape.two.data.default as RawExpression).__raw).toBe('now()');
      expect((ast.shape.three.data.default as RawExpression).__raw).toBe(
        'now()',
      );
    });

    describe('serial column', () => {
      it('should add serial column based on various default values', async () => {
        const db = new DbStructure(adapter);
        const table: DbStructure.Table = {
          schemaName: 'schema',
          name: 'table',
          columns: [],
        };
        structure.tables = [table];

        const defaults = [
          `nextval('table_id_seq'::regclass)`,
          `nextval('"table_id_seq"'::regclass)`,
          `nextval('schema.table_id_seq'::regclass)`,
          `nextval('schema."table_id_seq"'::regclass)`,
          `nextval('"schema".table_id_seq'::regclass)`,
          `nextval('"schema"."table_id_seq"'::regclass)`,
        ];

        for (const def of defaults) {
          table.columns = [
            {
              ...intColumn,
              name: 'id',
              schemaName: 'schema',
              tableName: 'table',
              default: def,
            },
          ];

          const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

          expect(ast.shape.id).toBeInstanceOf(SerialColumn);
          expect(ast.shape.id.data.default).toBe(undefined);
        }
      });

      it('should support smallserial, serial, and bigserial', async () => {
        const db = new DbStructure(adapter);
        const table: DbStructure.Table = {
          schemaName: 'schema',
          name: 'table',
          columns: [],
        };
        structure.tables = [table];

        const types = [
          ['int2', SmallSerialColumn],
          ['int4', SerialColumn],
          ['int8', BigSerialColumn],
        ] as const;

        for (const [type, Column] of types) {
          table.columns = [
            {
              ...intColumn,
              type,
              name: 'id',
              schemaName: 'schema',
              tableName: 'table',
              default: `nextval('table_id_seq'::regclass)`,
            },
          ];

          const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

          expect(ast.shape.id).toBeInstanceOf(Column);
          expect(ast.shape.id.data.default).toBe(undefined);
        }
      });
    });

    it('should set maxChars to char column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns: [varCharColumn] }];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      const column = ast.shape[varCharColumn.name];
      expect(column).toBeInstanceOf(VarCharColumn);
      expect(column.data.maxChars).toBe(varCharColumn.maxChars);
    });

    it('should set numericPrecision and numericScale to decimal column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns: [decimalColumn] }];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      const column = ast.shape[decimalColumn.name];
      expect(column).toBeInstanceOf(DecimalColumn);
      expect(column.data.numericPrecision).toBe(decimalColumn.numericPrecision);
      expect(column.data.numericScale).toBe(decimalColumn.numericScale);
    });

    it('should set dateTimePrecision to timestamp column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns: [timestampColumn] }];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      const column = ast.shape[timestampColumn.name];
      expect(column).toBeInstanceOf(TimestampTZColumn);
      expect(column.data.dateTimePrecision).toBe(
        timestampColumn.dateTimePrecision,
      );
    });

    it('should set primaryKey to column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getConstraints = async () => [primaryKey];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.noPrimaryKey).toBe('error');
      expect(ast.shape.id.data.isPrimaryKey).toBe(true);
      expect(ast.primaryKey).toBe(undefined);
    });

    it('should add composite primary key', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getConstraints = async () => [
        { ...primaryKey, primaryKey: ['id', 'name'] },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.noPrimaryKey).toBe('error');
      expect(ast.shape.id.data.isPrimaryKey).toBe(undefined);
      expect(ast.primaryKey).toEqual({
        columns: ['id', 'name'],
        options: { name: 'pkey' },
      });
    });

    it('should ignore primary key name if it is standard', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getConstraints = async () => [
        { ...primaryKey, primaryKey: ['id', 'name'], name: 'table_pkey' },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];

      expect(ast.noPrimaryKey).toBe('error');
      expect(ast.shape.id.data.isPrimaryKey).toBe(undefined);
      expect(ast.primaryKey).toEqual({
        columns: ['id', 'name'],
      });
    });

    it('should add index to column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getIndexes = async () => [{ ...index, nullsNotDistinct: true }];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];
      expect(ast.shape.name.data.indexes).toEqual([
        {
          name: 'index',
          unique: false,
          nullsNotDistinct: true,
        },
      ]);
      expect(ast.indexes).toHaveLength(0);
    });

    it('should ignore standard index name', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getIndexes = async () => [
        { ...index, name: getIndexName(table.name, index.columns) },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];
      expect(ast.shape.name.data.indexes).toEqual([
        {
          unique: false,
        },
      ]);
      expect(ast.indexes).toHaveLength(0);
    });

    it('should set index options to column index', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getIndexes = async () => [
        {
          ...index,
          using: 'gist',
          isUnique: true,
          nullsNotDistinct: true,
          columns: [
            {
              column: 'name',
              collate: 'en_US',
              opclass: 'varchar_ops',
              order: 'DESC',
            },
          ],
          include: ['id'],
          with: 'fillfactor=80',
          tablespace: 'tablespace',
          where: 'condition',
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];
      expect(ast.shape.name.data.indexes).toEqual([
        {
          name: 'index',
          using: 'gist',
          unique: true,
          collate: 'en_US',
          opclass: 'varchar_ops',
          order: 'DESC',
          include: ['id'],
          nullsNotDistinct: true,
          with: 'fillfactor=80',
          tablespace: 'tablespace',
          where: 'condition',
        },
      ]);
      expect(ast.indexes).toHaveLength(0);
    });

    it('should add composite indexes to the table', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getIndexes = async () => [
        { ...index, columns: [{ column: 'id' }, { column: 'name' }] },
        {
          ...index,
          columns: [{ column: 'id' }, { column: 'name' }],
          isUnique: true,
          nullsNotDistinct: true,
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];
      expect(ast.shape.name.data.indexes).toBe(undefined);
      expect(ast.indexes).toEqual([
        {
          columns: [{ column: 'id' }, { column: 'name' }],
          options: { name: 'index', unique: false },
        },
        {
          columns: [{ column: 'id' }, { column: 'name' }],
          options: { name: 'index', unique: true, nullsNotDistinct: true },
        },
      ]);
    });

    it('should ignore standard index name in composite index', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];

      const indexColumns = [{ column: 'id' }, { column: 'name' }];
      db.getIndexes = async () => [
        {
          ...index,
          columns: indexColumns,
          name: getIndexName(table.name, indexColumns),
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];
      expect(ast.shape.name.data.indexes).toBe(undefined);
      expect(ast.indexes).toEqual([
        {
          columns: indexColumns,
          options: { unique: false },
        },
      ]);
    });

    it('should add index with expression and options to the table', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns }];
      db.getIndexes = async () => [
        {
          ...index,
          using: 'gist',
          isUnique: true,
          nullsNotDistinct: true,
          columns: [
            {
              expression: 'lower(name)',
              collate: 'en_US',
              opclass: 'varchar_ops',
              order: 'DESC',
            },
          ],
          include: ['id'],
          with: 'fillfactor=80',
          tablespace: 'tablespace',
          where: 'condition',
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Table];
      expect(ast.shape.name.data.indexes).toBe(undefined);
      expect(ast.indexes).toEqual([
        {
          columns: [
            {
              expression: 'lower(name)',
              collate: 'en_US',
              opclass: 'varchar_ops',
              order: 'DESC',
            },
          ],
          options: {
            name: 'index',
            using: 'gist',
            unique: true,
            nullsNotDistinct: true,
            include: ['id'],
            with: 'fillfactor=80',
            tablespace: 'tablespace',
            where: 'condition',
          },
        },
      ]);
    });

    it('should add foreign key to the column', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        { ...table, name: 'table1' },
        {
          ...table,
          name: 'table2',
          columns: [{ ...intColumn, name: 'otherId', tableName: 'table2' }],
        },
      ];
      db.getConstraints = async () => [
        {
          ...foreignKey,
          tableName: 'table2',
          references: { ...foreignKey.references, foreignTable: 'table1' },
        },
      ];

      const [, ast] = (await structureToAst(ctx, db)) as RakeDbAst.Table[];

      expect(ast.shape.otherId.data.foreignKeys).toEqual([
        {
          columns: ['id'],
          name: 'fkey',
          table: 'public.table1',
          match: 'FULL',
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
      ]);
      expect(ast.constraints).toHaveLength(0);
    });

    it('should ignore standard foreign key name', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        { ...table, name: 'table1' },
        {
          ...table,
          name: 'table2',
          columns: [{ ...intColumn, name: 'otherId', tableName: 'table2' }],
        },
      ];
      db.getConstraints = async () => [
        {
          ...foreignKey,
          tableName: 'table2',
          name: `table2_otherId_fkey`,
          references: {
            ...foreignKey.references,
            foreignTable: 'table1',
          },
        },
      ];

      const [, ast] = (await structureToAst(ctx, db)) as RakeDbAst.Table[];

      expect(ast.shape.otherId.data.foreignKeys).toEqual([
        {
          columns: ['id'],
          table: 'public.table1',
          match: 'FULL',
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
      ]);
      expect(ast.constraints).toHaveLength(0);
    });

    it('should add composite foreign key', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        { ...table, name: 'table1' },
        {
          ...table,
          name: 'table2',
          columns: [{ ...intColumn, name: 'otherId', tableName: 'table2' }],
        },
      ];
      db.getConstraints = async () => [
        {
          ...foreignKey,
          tableName: 'table2',
          references: {
            ...foreignKey.references,
            columns: ['name', 'id'],
            foreignTable: 'table1',
            foreignColumns: ['otherName', 'otherId'],
          },
        },
      ];

      const [, ast] = (await structureToAst(ctx, db)) as RakeDbAst.Table[];

      expect(ast.shape.otherId.data.foreignKeys).toBe(undefined);
      expect(ast.constraints).toEqual([
        {
          name: 'fkey',
          references: {
            columns: ['name', 'id'],
            fnOrTable: 'public.table1',
            foreignColumns: ['otherName', 'otherId'],
            options: {
              match: 'FULL',
              name: 'fkey',
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            },
          },
        },
      ]);
    });

    it('should ignore standard foreign key name in a composite foreign key', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        { ...table, name: 'table1' },
        {
          ...table,
          name: 'table2',
          columns: [{ ...intColumn, name: 'otherId', tableName: 'table2' }],
        },
      ];
      db.getConstraints = async () => [
        {
          ...foreignKey,
          tableName: 'table2',
          name: 'table2_name_otherId_fkey',
          references: {
            ...foreignKey.references,
            foreignTable: 'table1',
            columns: ['name', 'otherId'],
            foreignColumns: ['name', 'id'],
          },
        },
      ];

      const [, ast] = (await structureToAst(ctx, db)) as RakeDbAst.Table[];

      expect(ast.shape.otherId.data.foreignKeys).toBe(undefined);
      expect(ast.constraints).toEqual([
        {
          references: {
            columns: ['name', 'otherId'],
            fnOrTable: 'public.table1',
            foreignColumns: ['name', 'id'],
            options: {
              match: 'FULL',
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
          },
        },
      ]);
    });

    it('should have referenced table before the table with foreign key', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          name: 'fkTable',
          columns: [
            { ...intColumn, name: 'table1Id', tableName: 'fkTable' },
            { ...intColumn, name: 'table2Id', tableName: 'fkTable' },
          ],
        },
        { ...table, name: 'table1' },
        { ...table, name: 'table2' },
        { ...table, name: 'otherTable' },
      ];
      db.getConstraints = async () => [
        {
          ...foreignKey,
          tableName: 'fkTable',
          references: {
            ...foreignKey.references,
            columns: ['table1Id'],
            foreignTable: 'table1',
          },
        },
        {
          ...foreignKey,
          tableName: 'fkTable',
          references: {
            ...foreignKey.references,
            columns: ['table2Id'],
            foreignTable: 'table2',
          },
        },
      ];

      const [table1, table2, fkTable, otherTable] = (await structureToAst(
        ctx,
        db,
      )) as RakeDbAst.Table[];

      expect(table1.name).toBe('table1');
      expect(table2.name).toBe('table2');
      expect(fkTable.name).toBe('fkTable');
      expect(otherTable.name).toBe('otherTable');
    });

    it('should add foreign key to the same table', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [{ ...table, columns: [intColumn] }];
      db.getConstraints = async () => [
        {
          ...foreignKey,
          tableName: table.name,
          references: {
            ...foreignKey.references,
            columns: [intColumn.name],
            foreignTable: table.name,
          },
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as RakeDbAst.Table[];

      expect(ast.name).toBe(table.name);
    });

    it('should add standalone foreign key when it is recursive', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [
        {
          ...table,
          name: 'table1',
          columns: [{ ...intColumn, tableName: 'table1' }],
        },
        {
          ...table,
          name: 'table2',
          columns: [{ ...intColumn, tableName: 'table2' }],
        },
      ];
      db.getConstraints = async () => [
        {
          ...foreignKey,
          tableName: 'table1',
          references: {
            ...foreignKey.references,
            columns: [intColumn.name],
            foreignTable: 'table2',
          },
        },
        {
          ...foreignKey,
          tableName: 'table2',
          references: {
            ...foreignKey.references,
            columns: [intColumn.name],
            foreignTable: 'table1',
          },
        },
      ];

      const [table1, table2, fkey] = (await structureToAst(
        ctx,
        db,
      )) as RakeDbAst.Table[];

      expect(table1.name).toBe('table1');
      expect(table1.shape[intColumn.name].data.foreignKeys).toBe(undefined);
      expect(table2.name).toBe('table2');
      expect(table2.shape[intColumn.name].data.foreignKeys).toEqual([
        {
          table: 'public.table1',
          columns: ['id'],
          match: 'FULL',
          name: 'fkey',
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
      ]);

      expect(fkey).toEqual({
        type: 'constraint',
        action: 'create',
        tableName: 'table1',
        tableSchema: 'public',
        name: 'fkey',
        references: {
          columns: ['column'],
          fnOrTable: 'public.table2',
          foreignColumns: ['id'],
          options: {
            match: 'FULL',
            name: 'fkey',
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
        },
      });
    });

    describe('identity', () => {
      it('should add `as default` identity', async () => {
        const db = new DbStructure(adapter);
        structure.tables = [{ ...table, columns: [identityColumn] }];

        const [{ shape }] = (await structureToAst(
          ctx,
          db,
        )) as RakeDbAst.Table[];

        expect(shape.identity.data.identity).toEqual({});
      });

      it('should add `always` identity with options', async () => {
        const db = new DbStructure(adapter);

        const options = {
          always: true,
          start: 2,
          increment: 3,
          min: 4,
          max: 5,
          cache: 6,
          cycle: true,
        };

        structure.tables = [
          {
            ...table,
            columns: [
              {
                ...identityColumn,
                identity: options,
              },
            ],
          },
        ];

        const [{ shape }] = (await structureToAst(
          ctx,
          db,
        )) as RakeDbAst.Table[];

        expect(shape.identity.data.identity).toEqual(options);
      });
    });
  });

  describe('constraint', () => {
    it('should add constraint with references and check', async () => {
      const db = new DbStructure(adapter);
      structure.tables = [table];
      db.getConstraints = async () => [
        {
          schemaName: table.schemaName,
          tableName: table.name,
          name: 'constraintName',
          references: {
            ...foreignKey.references,
            columns: ['id', 'name'],
            foreignColumns: ['foreignId', 'foreignName'],
          },
          check: {
            expression: 'check',
          },
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as RakeDbAst.Table[];

      expect(ast.constraints).toEqual([
        {
          name: 'constraintName',
          references: {
            columns: ['id', 'name'],
            foreignColumns: ['foreignId', 'foreignName'],
            fnOrTable: `public.${foreignKey.references.foreignTable}`,
            options: {
              name: 'constraintName',
              match: 'FULL',
              onUpdate: 'CASCADE',
              onDelete: 'CASCADE',
            },
          },
          check: raw('check'),
        },
      ]);
    });
  });

  describe('extension', () => {
    it('should add extension', async () => {
      const db = new DbStructure(adapter);
      db.getExtensions = async () => [{ ...extension, schemaName: 'custom' }];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Extension];

      expect(ast).toEqual({
        type: 'extension',
        action: 'create',
        name: 'name',
        version: '123',
      });
    });

    it('should not ignore schema if it is not current schema', async () => {
      const db = new DbStructure(adapter);
      db.getExtensions = async () => [extension];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Extension];

      expect(ast).toEqual({
        type: 'extension',
        action: 'create',
        schema: 'public',
        name: 'name',
        version: '123',
      });
    });
  });

  describe('enum', () => {
    it('should add enum', async () => {
      const db = new DbStructure(adapter);
      db.getEnums = async () => [{ ...enumType, schemaName: 'custom' }];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Enum];

      expect(ast).toEqual({
        type: 'enum',
        action: 'create',
        name: 'mood',
        values: enumType.values,
      });
    });

    it('should not ignore schema if it is not a current schema', async () => {
      const db = new DbStructure(adapter);
      db.getEnums = async () => [enumType];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Enum];

      expect(ast).toEqual({
        type: 'enum',
        action: 'create',
        schema: 'public',
        name: 'mood',
        values: enumType.values,
      });
    });
  });

  describe('domain', () => {
    it('should add domain', async () => {
      const db = new DbStructure(adapter);
      db.getDomains = async () => [
        {
          ...domain,
          schemaName: 'custom',
          notNull: true,
          collation: 'C',
          default: '123',
          check: 'VALUE = 42',
        },
      ];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Domain];

      expect(ast).toEqual({
        type: 'domain',
        action: 'create',
        name: domain.name,
        baseType: expect.any(IntegerColumn),
        notNull: true,
        collation: 'C',
        default: raw('123'),
        check: raw('VALUE = 42'),
      });
    });

    it('should not ignore schema if it not current schema', async () => {
      const db = new DbStructure(adapter);
      db.getDomains = async () => [domain];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.Domain];

      expect(ast.schema).toBe('public');
    });
  });

  describe('view', () => {
    it('should add view', async () => {
      const db = new DbStructure(adapter);
      structure.views = [view];

      const [ast] = (await structureToAst(ctx, db)) as [RakeDbAst.View];

      expect(ast.type).toBe('view');
      expect(ast.action).toBe('create');
      expect(ast.schema).toBe(undefined);
      expect(ast.options.recursive).toBe(true);
      expect(ast.options.with?.checkOption).toBe('LOCAL');
      expect(ast.options.with?.securityBarrier).toBe(true);
      expect(ast.options.with?.securityInvoker).toBe(true);

      const column = ast.shape[intColumn.name];
      expect(column.dataType).toBe('integer');
    });
  });
});
