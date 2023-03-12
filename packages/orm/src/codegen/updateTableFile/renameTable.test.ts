import { updateTableFile } from './updateTableFile';
import { asMock, ast, makeTestWritten, tablePath } from '../testUtils';
import { resolve } from 'path';
import fs from 'fs/promises';
import { pathToLog } from 'orchid-core';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

const baseTablePath = resolve('baseTable.ts');
const baseTableName = 'BaseTable';
const log = jest.fn();
const params = {
  baseTablePath,
  baseTableName,
  tablePath,
  logger: { ...console, log },
};

const path = tablePath('some');
const testWrittenOnly = makeTestWritten(path);
const testWritten = (content: string) => {
  testWrittenOnly(content);
  expect(log).toBeCalledWith(`Updated ${pathToLog(path)}`);
};

describe('renameTable', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should change `table` property', async () => {
    asMock(fs.readFile)
      .mockResolvedValue(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  table = 'some';
  columns = this.setColumns((t) => ({}));
}`);

    await updateTableFile({
      ...params,
      ast: ast.renameTable,
    });

    testWritten(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  table = 'another';
  columns = this.setColumns((t) => ({}));
}`);
  });

  it('should change `schema` property', async () => {
    asMock(fs.readFile)
      .mockResolvedValue(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  schema = 'one';
  table = 'some';
  columns = this.setColumns((t) => ({}));
}`);

    await updateTableFile({
      ...params,
      ast: {
        ...ast.renameTable,
        fromSchema: 'one',
        toSchema: 'two',
      },
    });

    testWritten(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  schema = 'two';
  table = 'another';
  columns = this.setColumns((t) => ({}));
}`);
  });

  it('should remove `schema` property', async () => {
    asMock(fs.readFile)
      .mockResolvedValue(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  schema = 'one';
  table = 'some';
  columns = this.setColumns((t) => ({}));
}`);

    await updateTableFile({
      ...params,
      ast: {
        ...ast.renameTable,
        fromSchema: 'one',
      },
    });

    testWritten(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  table = 'another';
  columns = this.setColumns((t) => ({}));
}`);
  });

  it('should add `schema` property', async () => {
    asMock(fs.readFile)
      .mockResolvedValue(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  table = 'some';
  columns = this.setColumns((t) => ({}));
}`);

    await updateTableFile({
      ...params,
      ast: {
        ...ast.renameTable,
        toSchema: 'schema',
      },
    });

    testWritten(`import { BaseTable } from '../baseTable';

export class SomeTable extends BaseTable {
  schema = 'schema';
  table = 'another';
  columns = this.setColumns((t) => ({}));
}`);
  });
});
