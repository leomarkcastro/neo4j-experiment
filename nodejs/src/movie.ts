import neo4j from "neo4j-driver";
import { PersonActedInMovie } from "./types/MovieRelations";

async function main() {
  const driver = neo4j.driver(
    "neo4j://localhost:7687",
    neo4j.auth.basic("neo4j", "password")
  );
  const session = driver.session();

  try {
    // create a person
    await session.executeWrite((tx) =>
      tx.run<PersonActedInMovie>(
        `
          CREATE (p:Person {name: $name, born: $born})
          RETURN p
        `,
        { name: "Tom Hanks", born: 1956 }
      )
    );

    // create a movie
    await session.executeWrite((tx) =>
      tx.run<PersonActedInMovie>(
        `
          CREATE (m:Movie {title: $title, rating: $rating})
          RETURN m
        `,
        { title: "Forrest Gump", rating: 8.8 }
      )
    );

    // create a relationship between the person and the movie
    await session.executeWrite((tx) =>
      tx.run<PersonActedInMovie>(
        `
          MATCH (p:Person {name: $name})
          MATCH (m:Movie {title: $title})
          CREATE (p)-[r:ACTED_IN {roles: $roles}]->(m)
          RETURN p, r, m
        `,
        { name: "Tom Hanks", title: "Forrest Gump", roles: ["Forrest"] }
      )
    );

    const res = await session.executeRead((tx) =>
      tx.run<PersonActedInMovie>(
        `
          MATCH (p:Person)-[r:ACTED_IN]->(m:Movie {title: $title})
          RETURN p, r, m
        `,
        { title: "Forrest Gump" }
      )
    );

    const singleRecord = res.records[0];

    console.log(JSON.stringify(singleRecord.get("p").properties.name));
  } finally {
    await session.close();
  }

  // on application exit:
  await driver.close();
}

main().catch((error) => {
  console.error(error);
});
