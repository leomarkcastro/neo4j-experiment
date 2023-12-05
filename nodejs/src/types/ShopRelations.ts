import { Integer, Node, Relationship } from "neo4j-driver";

export type Person = Node<
  Integer,
  {
    tmdbId: string;
    name: string;
  }
>;

export type Item = Node<
  Integer,
  {
    tmdbId: string;
    name: string;
    price: number;
  }
>;

export type Category = Node<
  Integer,
  {
    tmdbId: string;
    name: string;
  }
>;

export type BelongsIn = Relationship<
  Integer,
  {
    score: number;
  }
>;

export type Buys = Relationship<
  Integer,
  {
    amount: number;
  }
>;

export interface ShopRelations {
  i: Item;
  c: Category;
  p: Person;
  bi: BelongsIn;
  bu: Buys;
}
