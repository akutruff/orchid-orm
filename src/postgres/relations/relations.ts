import { PostgresModelConstructor, Query } from '../model';
import { SetQueryReturns } from '../queryBuilder/queryMethods';
import { BelongsTo } from './belongsTo';
import { QueryData } from '../queryBuilder/toSql';

export type ModelOrQuery = PostgresModelConstructor | Query;

export type ModelOrQueryToQuery<T extends ModelOrQuery> =
  T extends PostgresModelConstructor ? MapRelationMethods<InstanceType<T>> : T;

export type RelationType = 'belongsTo';

export type RelationThunk<
  Type extends RelationType = RelationType,
  Q extends ModelOrQuery = ModelOrQuery,
  Options extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: Type;
  fn: () => Q;
  options: Options;
};

export type Relation<
  Key extends PropertyKey = PropertyKey,
  T extends RelationThunk = RelationThunk,
> = {
  key: Key;
  type: T['type'];
  query: ModelOrQueryToQuery<ReturnType<T['fn']>>;
  options: T['options'];
  joinQuery: Query & { query: QueryData };
};

export type MapRelationMethods<T extends Query> = Omit<
  {
    [K in keyof T]: T[K] extends BelongsTo<Query, infer Q, infer Options>
      ? (
          params: Record<
            Options['foreignKey'],
            Q['type'][Options['primaryKey']]
          >,
        ) => SetQueryReturns<Q, 'one'>
      : T[K];
  },
  'relations'
> & {
  relations: Relations<T>;
};

export type Relations<T extends Query> = {
  [K in keyof T]: T[K] extends RelationThunk ? Relation<K, T[K]> : never;
};

export class RelationMethods {
  belongsTo<
    T extends Query,
    F extends ModelOrQuery,
    Q extends Query = ModelOrQueryToQuery<F>,
    PK extends keyof Q['type'] = Q['primaryKeys'][0],
    FK extends keyof T['type'] = `${Q['table']}Id`,
  >(
    this: T,
    fn: () => F,
    options?: {
      primaryKey: PK;
      foreignKey: FK;
    },
  ): BelongsTo<T, Q, { primaryKey: PK; foreignKey: FK }> {
    return new BelongsTo(
      // it's necessary to convert model to query here
      // otherwise, TS cannot pick the type of model
      fn as unknown as () => Q,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      options!,
    );
  }
}
