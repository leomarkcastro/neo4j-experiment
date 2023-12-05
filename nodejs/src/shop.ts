import neo4j, { Session } from "neo4j-driver";
import { Item, ShopRelations } from "./types/ShopRelations";
import { Person } from "./types/MovieRelations";

async function createPerson(session: Session, name: string) {
  await session.executeWrite((tx) =>
    tx.run<ShopRelations>(
      `
        MERGE (p:Person {name: $name})
        RETURN p
      `,
      { name }
    )
  );
}

async function createItem(session: Session, name: string, price: number) {
  await session.executeWrite((tx) =>
    tx.run<ShopRelations>(
      `
        MERGE (i:Item {name: $name, price: $price})
        RETURN i
      `,
      { name, price }
    )
  );
}

async function createCategory(session: Session, name: string) {
  await session.executeWrite((tx) =>
    tx.run<ShopRelations>(
      `
        MERGE (c:Category {name: $name})
        RETURN c
      `,
      { name }
    )
  );
}

async function createBelongsIn(
  session: Session,
  item: string,
  category: string,
  score: number
) {
  await session.executeWrite((tx) =>
    tx.run<ShopRelations>(
      `
        MERGE (i:Item {name: $item})
        MERGE (c:Category {name: $category})
        MERGE (i)-[bi:BELONGS_IN {score: $score}]->(c)
        RETURN i, bi, c
      `,
      { item, category, score }
    )
  );
}

async function createOrIncrementBuys(
  session: Session,
  person: string,
  item: string,
  amount: number
) {
  await session.executeWrite((tx) =>
    tx.run<ShopRelations>(
      `
        MERGE (p:Person {name: $person})
        MERGE (i:Item {name: $item})
        MERGE (p)-[bu:BUYS]->(i)
        ON CREATE SET bu.amount = $amount
        ON MATCH SET bu.amount = bu.amount + $amount
        RETURN p, bu, i
      `,
      { person, item, amount }
    )
  );
}

async function createSession() {
  const driver = neo4j.driver(
    "neo4j://localhost:7687",
    neo4j.auth.basic("neo4j", "password")
  );

  return {
    driver,
    session: driver.session(),
  };
}

async function initPersons(names: string[]) {
  const { session } = await createSession();

  try {
    for (const name of names) {
      await createPerson(session, name);
    }
  } finally {
    await session.close();
  }
}

async function initCategories(categories: string[]) {
  const { session } = await createSession();

  try {
    for (const category of categories) {
      await createCategory(session, category);
    }
  } finally {
    await session.close();
  }
}

async function initItems(items: { name: string; price: number }[]) {
  const { session } = await createSession();

  try {
    for (const item of items) {
      await createItem(session, item.name, item.price);
    }
  } finally {
    await session.close();
  }
}

async function initBelongsIn(
  connections: {
    item: string;
    category: string;
    score: number;
  }[]
) {
  const { session } = await createSession();

  try {
    for (const connection of connections) {
      await createBelongsIn(
        session,
        connection.item,
        connection.category,
        connection.score
      );
    }
  } finally {
    await session.close();
  }
}

async function initBuys(
  connections: {
    person: string;
    item: string;
    amount: number;
  }[]
) {
  const { session } = await createSession();

  try {
    for (const connection of connections) {
      await createOrIncrementBuys(
        session,
        connection.person,
        connection.item,
        connection.amount
      );
    }
  } finally {
    await session.close();
  }
}

const recommend = {
  // Recommend by getting similar items of the same category
  byContent: async (person: string) => {
    const { session } = await createSession();

    try {
      // const res = await session.executeRead((tx) =>
      //   tx.run<{
      //     i2: Item;
      //     score: number;
      //   }>(
      //     `
      //       MATCH (p:Person {name: $person})-[bu:BUYS]->(i:Item)
      //       MATCH (i)-[bi:BELONGS_IN]->(c:Category)<-[bi2:BELONGS_IN]-(i2:Item)
      //       WHERE NOT (p)-[:BUYS]->(i2)
      //       RETURN i2, bi2.score AS score
      //       ORDER BY score DESC
      //     `,
      //     { person }
      //   )
      // );

      const res = await session.executeRead((tx) =>
        tx.run<{
          recomm: string;
          jaccard: number;
        }>(
          `
          // Query all items that the person has bought
          // Get all categories of those items
          // Get all items that belong to those categories
            MATCH (p:Person {name: $person})-[:BUYS]->(i:Item)-[:BELONGS_IN]->(c:Category)<-[:BELONGS_IN]-(i2:Item)
            WHERE NOT EXISTS ((p)-[:BUYS]->(i2))

          // Here, we will calculate the Jaccard similarity between the items
            WITH i, i2, COUNT(c) AS intersection

          // Get all categories of the first item
            MATCH (i)-[:BELONGS_IN]->(ic:Category)
            WITH i, i2, intersection, COLLECT(ic.name) AS s1
          // remove duplicates from the list of categories
            WITH i, i2, intersection, REDUCE(s = [], x IN s1 | CASE WHEN x IN s THEN s ELSE s + x END) AS s1

          // Get all categories of the second item
            MATCH (i2)-[:BELONGS_IN]->(i2c:Category)
            WITH i, i2, s1, intersection, COLLECT(i2c.name) AS s2
          // remove duplicates from the list of categories
            WITH i, i2, s1, intersection, REDUCE(s = [], x IN s2 | CASE WHEN x IN s THEN s ELSE s + x END) AS s2

          // Calculate the Jaccard similarity between the items
            WITH i, i2, intersection, s1+[x IN s2 WHERE NOT x IN s1] AS union, s1, s2

            RETURN i2.name as recomm, ((1.0*intersection)/SIZE(union)) AS jaccard ORDER BY jaccard DESC
          `,
          { person }
        )
      );

      const recomm = res.records.map((record) => ({
        recomm: record.get("recomm"),
        jaccard: record.get("jaccard"),
      }));
      // remove duplicates from the list of items by name
      const uniqueRecomm = recomm.filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.recomm === item.recomm)
      );
      return uniqueRecomm;
    } finally {
      await session.close();
    }
  },
  // Recommend by getting the most popular items of the same category
  byPopularity: async (person: string) => {
    const { session } = await createSession();

    // use jaccard similarity to get the most popular items of the same category by amount of purchases
    try {
      const res = await session.executeRead((tx) =>
        tx.run<{
          i2: Item;
          score: number;
        }>(
          `
            MATCH (p: Person {name: $person})-[bu:BUYS]->(i:Item)-[bi:BELONGS_IN]->(c:Category)<-[bi2:BELONGS_IN]-(i2:Item)<-[bu2:BUYS]-(p2:Person)
            WHERE NOT (p)-[:BUYS]->(i2)
            
            WITH i, i2, COUNT(p2) AS intersection

            MATCH (i)-[:BELONGS_IN]->(ic:Category)
            WITH i, i2, intersection, COLLECT(ic.name) AS s1
            WITH i, i2, intersection, REDUCE(s = [], x IN s1 | CASE WHEN x IN s THEN s ELSE s + x END) AS s1

            MATCH (i2)-[:BELONGS_IN]->(i2c:Category)
            WITH i, i2, s1, intersection, COLLECT(i2c.name) AS s2
            WITH i, i2, s1, intersection, REDUCE(s = [], x IN s2 | CASE WHEN x IN s THEN s ELSE s + x END) AS s2

            WITH i, i2, intersection, s1+[x IN s2 WHERE NOT x IN s1] AS union, s1, s2

            RETURN i2, ((1.0*intersection)/SIZE(union)) AS score ORDER BY score DESC
          `,
          { person }
        )
      );

      const items = res.records.map((record) => ({
        item: record.get("i2").properties.name,
        score: record.get("score"),
      }));
      // remove duplicates from the list of items by name
      const uniqueItems = items.filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.item === item.item)
      );
      return uniqueItems;
    } finally {
      await session.close();
    }
  },
  // Recommend by getting items that a person's most similar customers have bought
  byCollaborativePurchase: async (person: string) => {
    const { session } = await createSession();

    try {
      const res = await session.executeRead((tx) =>
        tx.run<{
          i3: Item;
          frequency: {
            low: number;
            high: number;
          };
        }>(
          `
            MATCH (p:Person {name: $person})-[bu:BUYS]->(i:Item)<-[bu2:BUYS]-(p2:Person)-[bu3:BUYS]->(i3:Item)
            WHERE NOT (p)-[:BUYS]->(i3)
            
            WITH i3, COUNT(p2) AS frequency

            RETURN i3, frequency ORDER BY frequency DESC

          `,
          { person }
        )
      );

      const query = res.records.map((record) => ({
        item: record.get("i3").properties.name,
        frequency: record.get("frequency").low,
      }));
      // remove duplicates from the list of items by name
      const uniqueQuery = query.filter(
        (item, index, self) =>
          index === self.findIndex((t) => t.item === item.item)
      );
      return uniqueQuery;
    } finally {
      await session.close();
    }
  },
  // Recommend by getting a person's most similar customers
  byCollaborative: async (person: string) => {
    const { session } = await createSession();

    try {
      const res = await session.executeRead((tx) =>
        tx.run<{
          p2: Person;
          score: number;
        }>(
          `
            MATCH (p:Person {name: $person})-[bu:BUYS]->(i:Item)
            MATCH (p2:Person)-[bu2:BUYS]->(i)
            WHERE NOT p = p2
            RETURN p2, SUM(bu2.amount) AS score
            ORDER BY score DESC
            LIMIT 3
          `,
          { person }
        )
      );

      return res.records.map((record) => ({
        person: record.get("p2").properties.name,
        score: record.get("score"),
      }));
    } finally {
      await session.close();
    }
  },
};

const ITEMS = [
  { name: "Apple Juice", categories: ["Food", "Drinks"], price: 1 },
  { name: "Salt", categories: ["Food", "Spices"], price: 2 },
  { name: "Lotion", categories: ["Cosmetics"], price: 3 },
  {
    name: "Watermelon Cologne",
    categories: ["Cosmetics", "Fragrance"],
    price: 4,
  },
];

async function main() {
  // for (const item of ITEMS) {
  //   await initItems([{ name: item.name, price: item.price }]);
  //   await initCategories(item.categories);
  //   await initBelongsIn(
  //     item.categories.map((category) => ({
  //       item: item.name,
  //       category,
  //       score: 1,
  //     }))
  //   );
  // }

  await initBuys([{ person: "Bob", item: "Apple", amount: 1 }]);

  console.log("Content based recommendations for Alice:");
  console.log(await recommend.byContent("Alice"));

  console.log("Purchase based recommendations for Alice:");
  console.log(await recommend.byPopularity("Alice"));

  console.log("Similar Customers to ALice:");
  console.log(await recommend.byCollaborative("Alice"));

  console.log("Collaborative filtering recommendations for Alice:");
  console.log(await recommend.byCollaborativePurchase("Alice"));
}

main().catch((error) => {
  console.error(error);
});
