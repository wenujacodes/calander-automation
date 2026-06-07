const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("ROOT OK");
});

app.get("/timetable", (req, res) => {
  res.json({ status: "timetable OK" });
});

app.listen(3000, () => {
  console.log("Server running on 3000");
});