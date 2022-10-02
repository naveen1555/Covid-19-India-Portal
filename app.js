const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const databasePath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();

app.use(express.json());

let database = null;

const initializeConnectionWithDbToServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000");
    });
  } catch (error) {
    console.log(`Db Error: ${error.message}`);
    process.exit(1);
  }
};

initializeConnectionWithDbToServer();

const getStateDetails = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const getDistrictDetails = (eachDistrict) => {
  return {
    districtId: eachDistrict.district_id,
    districtName: eachDistrict.district_name,
    stateId: eachDistrict.state_id,
    cases: eachDistrict.cases,
    cured: eachDistrict.cured,
    active: eachDistrict.active,
    deaths: eachDistrict.deaths,
  };
};

// User AuAuthentication API

const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "PROVIDING_ACCESS_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

// User Login API

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserDetailsQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const userDetails = await database.get(checkUserDetailsQuery);

  if (userDetails === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, userDetails.password);
    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "PROVIDING_ACCESS_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Returns a list of all states in the state table

app.get("/states/", authenticationToken, async (request, response) => {
  const getAllStatesQuery = `
  SELECT 
    * 
  FROM 
    state;`;
  const statesArray = await database.all(getAllStatesQuery);
  response.send(statesArray.map((eachState) => getStateDetails(eachState)));
});

//Returns a state based on the state ID

app.get("/states/:stateId/", authenticationToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateDetailsQuery = `
  SELECT 
    * 
  FROM 
    state 
  WHERE 
    state_id = ${stateId};`;
  const state = await database.get(getStateDetails);
  response.send(getStateDetails(state));
});

//Create a district in the district table, district_id is auto-incremented

app.post("/districts/", authenticationToken, async (request, response) => {
  const { stateId, districtName, cases, cured, active, deaths } = request.body;
  const createDistrictQuery = `
  INSERT INTO 
  district (state_id, district_name, cases, cured, active, deaths)
  VALUES(
       ${stateId},
      '${districtName}',
       ${cases},
       ${cured},
       ${active},
       ${deaths});`;
  await database.run(createDistrictQuery);
  response.send(`District Successfully Added`);
});

//Returns a district based on the district ID

app.get(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = ` 
    SELECT 
      * 
    FROM 
      district
    WHERE 
      district_id = ${districtId};`;
    const district = await database.get(getDistrictQuery);
    response.send(getDistrictDetails(district));
  }
);

//Deletes a district from the district table based on the district ID

app.delete(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM 
      district 
    WHERE 
      district_id = ${districtId};`;
    await database.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Updates the details of a specific district based on the district ID

app.put(
  "/districts/:districtId/",
  authenticationToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = ` 
    UPDATE 
      district 
    SET
      district_name = '${districtName}',
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active},
      deaths = ${deaths}
    WHERE
      district_id = ${districtId};`;
    await database.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

//Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID

app.get(
  "/states/:stateId/stats/",
  authenticationToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatusDetails = `
    SELECT 
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM 
      state
    NATURAL JOIN
      district
    WHERE 
      state_id = ${stateId};`;
    const stats = await database.get(getStatusDetails);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);

module.exports = app;
