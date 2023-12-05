import { Integer, Node, Relationship } from "neo4j-driver";

export type Movie = Node<
  Integer,
  {
    tmdbId: string;
    title: string;
    rating: number;
  }
>;

export type Person = Node<
  Integer,
  {
    tmdbId: string;
    name: string;
    born: number; // Year of birth
  }
>;

export type ActedIn = Relationship<
  Integer,
  {
    roles: string[];
  }
>;

export interface PersonActedInMovie {
  p: Person;
  r: ActedIn;
  m: Movie;
}
