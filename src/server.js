const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("Uni Calendar API running");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});