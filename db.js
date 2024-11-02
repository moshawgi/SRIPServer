const mongoose = require("mongoose");
const { Password } = require("./info.json")

const mongoURI = `mongodb+srv://DatabaseReader:${Password}@testcluster.aserhi2.mongodb.net/?retryWrites=true&w=majority&appName=TestCluster`;
const connectMongo = async () => {

  try {
    await mongoose.connect(mongoURI);
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("Error connecting to MongoDB: ", error.message);
  }
};

module.exports = connectMongo;