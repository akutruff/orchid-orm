import { getRaw, isRaw } from '../common';
import { quoteSchemaAndTable } from './common';
import { Query } from '../query';
import { queryKeysOfNotSimpleQuery, SelectQueryData } from './types';

export const pushFromAndAs = (
  sql: string[],
  model: Query,
  query: SelectQueryData,
  values: unknown[],
  quotedAs?: string,
) => {
  if (!query.from && !model.table) return;

  sql.push('FROM');
  if (query.fromOnly) sql.push('ONLY');

  const from = getFrom(model, query, values);
  sql.push(from);

  if (query.as && quotedAs && quotedAs !== from) {
    sql.push('AS', quotedAs as string);
  }
};

const getFrom = (model: Query, query: SelectQueryData, values: unknown[]) => {
  if (query.from) {
    if (typeof query.from === 'object') {
      if (isRaw(query.from)) {
        return getRaw(query.from, values);
      }

      if (!query.from.table) {
        const sql = query.from.toSql(values);
        return `(${sql.text})`;
      }

      const q = query.from.query;
      const keys = Object.keys(q) as (keyof SelectQueryData)[];
      // if query contains more than just schema return (SELECT ...)
      if (keys.some((key) => queryKeysOfNotSimpleQuery.includes(key))) {
        const sql = query.from.toSql(values);
        return `(${sql.text})`;
      }

      return quoteSchemaAndTable(q.schema, query.from.table);
    }

    return quoteSchemaAndTable(query.schema, query.from);
  }

  return quoteSchemaAndTable(query.schema, model.table as string);
};
