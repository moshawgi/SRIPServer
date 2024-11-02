const connectToMongo = require("./db");
const express = require("express");
const app = express();
connectToMongo();
app.use(express.json());
app.use(express.static('images'));
app.use("/auth", require("./auth"));
const port = 3300;
app.listen(port, '0.0.0.0', () => {
  console.log(`Listening at http://localhost:${port}`);
});