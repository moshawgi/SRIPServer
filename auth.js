const express = require("express");
const router = express.Router();
const User = require("./User.js");
const Market = require("./Market.js");
const Message = require("./Message.js");
const bcrypt = require("bcryptjs");
const { ApiKeyManager } = require('@esri/arcgis-rest-request');
const { geocode } = require('@esri/arcgis-rest-geocoding');
const { API_KEY } = require('./info.json');
const lookup = require('country-code-lookup');
const { createClient } = require("redis");
const multer = require("multer")

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, './images');
  },
  filename(req, file, callback) {
    callback(null, `${file.originalname}`);
  },
});

const upload = multer({ storage });


const client = createClient();
client.on('error', err => console.log('Redis Client Error', err));
client.on('connect', () => {console.log("Connected to Redis")})
client.connect();

const authentication = ApiKeyManager.fromKey(API_KEY);

const blocked_characters = [" ", `"`, `'`, ",", "-"]

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

let rand = function() {
  return Math.random().toString(36).substr(2);
};

let token = function() {
  return rand() + rand();
};

//Sign Up:
router.post("/signup", async (req, res) => {
  console.log(req.body)
  let userTest = await User.findOne({ userName: req.body.userName });
  if (userTest) {
    return res.json({ error: "Invalid credentials!" });
  }
  for (let i = 0; i < blocked_characters.length; i++) {
    if (req.body.userName.indexOf(blocked_characters[i]) !== -1) {
      return res.json({ error: "Invalid credentials!" });
    }
  }
  let accountTypes = ["Farmer", "Market Owner", "Consumer", "Transporter"]
  if (accountTypes.indexOf(req.body.accountType) === -1) {
    return res.json({ error: "Invalid credentials!" });
  }
  if (!req.body.userName || !req.body.password || !req.body.firstName || !req.body.lastName || req.body.password !== req.body.confirmPassword) {
    return res.json({ error: "Invalid credentials!" });
  }
  const salt = await bcrypt.genSalt(10);
  const secPass = await bcrypt.hash(req.body.password, salt);
  try {await User.create({
    userName: req.body.userName,
    password: secPass,
    accountType: req.body.accountType,
    firstName: req.body.firstName,
    lastName: req.body.lastName
  })
  res.json({ success: "Account succesfully created!" });}
  catch (error) {
    console.error(error)
    return res.json({ error: "Invalid credentials!" });
  }
});

//Login:
router.post("/login", async (req, res) => {
    console.log("signin")
    let user = await User.findOne({ userName: req.body.userName });
    if (!user) {
      return res.json({ error: "Login with proper credentials!" });
    }
    
    const passwordCompare = await bcrypt.compare(req.body.password, user.password);
    if (!passwordCompare) {
      return res
        .json({ error: "Login with proper credentials!" });
    }
    let userToken = token()
    console.log(userToken)
    await client.hSet(userToken, {userName: user.userName, password: user.password, accountType: user.accountType, firstName: user.firstName, lastName: user.lastName})
    await client.set(user.userName, userToken)
    res.json({ success: "Authenticated!" , token: userToken});
});

//Market Add:
router.post("/marketadd", async (req, res) => {
  console.log("marketadd")
  if (!req.body.address || req.body.foods.length === 0 || req.body.description.length === 0 || req.body.zipCode.length === 0 || req.body.country.length === 0) {
    return res.json({ error: "Invalid information!" });
  }
  if (!lookup.byCountry(req.body.country)) {
    return res.json({ error: "Invalid information!" })
  }
  let countryCode = lookup.byCountry(req.body.country).iso2
  let coordinates = await geocode({
    address: req.body.address,
    postal: req.body.zipCode,
    countryCode: countryCode,
    authentication
  })
  try {
  await Market.create({
    address: req.body.address,
    latitude: coordinates.candidates[0].location.y,
    longitude: coordinates.candidates[0].location.x,
    foods: req.body.foods,
    description: req.body.description,
    verified: true
  });
  res.json({ success: "Authenticated!" })}
  catch (error) {
    console.error(error)
  }
});

//Market find
router.post("/marketfind", async (req, res) => {
  console.log("marketfind")
  if (!req.body.radius || !req.body.coordinates) {
    return res.json({ error: "Invalid information!" });
  }
  let markets = []
  let conversionRatio = 1
  if (req.body.miles) {
    conversionRatio = 0.621371
  }
  let nearbyMarkets = await Market.find({
    verified: true,
    latitude: { $gt: (req.body.coordinates[0] - (req.body.radius/(111*conversionRatio))), $lt: (req.body.coordinates[0] + (req.body.radius/(111*conversionRatio)))},
    longitude: { $gt: (req.body.coordinates[1] - (req.body.radius/(111*conversionRatio))), $lt: (req.body.coordinates[1] + (req.body.radius/(111*conversionRatio)))}
  })
  console.log(nearbyMarkets)
  for (let i = 0; i < nearbyMarkets.length; i++) {
    let distance = getDistanceFromLatLonInKm(req.body.coordinates[0], req.body.coordinates[1], nearbyMarkets[i].latitude, nearbyMarkets[i].longitude) * conversionRatio
    if (distance < req.body.radius) {
      markets.push(nearbyMarkets[i])
    }
  }
  res.json({ success: "Authenticated!", result: markets })
});

//Profile Search
router.post("/profilesearch", async (req, res) => {
  console.log("profilesearch")
  let users = []
  if (req.body.sendingQuery) {
    users = await User.find({$or:[{accountType: {"$regex": req.body.query, "$options": "i"}}, {userName: {"$regex": req.body.query, "$options": "i"}}, {firstName: {"$regex": req.body.query, "$options": "i"}}, {lastName: {"$regex": req.body.query, "$options": "i"}}]}, 'userName accountType firstName lastName')
  }
  else {
    users = await User.find({}, 'userName accountType firstName lastName')
  }
  let user = await client.hGetAll(req.body.token)
  if (users.findIndex(elem => elem.userName === user.userName) !== -1) {
    users.splice(users.findIndex(elem => elem.userName === user.userName), 1)
  }
  // for (let i = 0; i < users.length; i++) {
  //   users[i].userName = users[i].userName.replace(users[i].userName.substring(users[i].userName.indexOf("@")), "")
  // }
  res.json({ success: "Authenticated!", result: users })
})

//Message Find
router.post("/messagefind", async (req, res) => {
  console.log("messagefind")
  if (!req.body.token) {
    console.log("Invalid token")
    return res.json({error: "Invalid information!"})
  }
  let user = {}
  try {user = await client.hGetAll(req.body.token)} catch {console.log("Invalid token 2"); return res.json({error: "Invalid information!"})}
  user = user.userName
  let messages = await Message.find({$or:[{to: user}, {from:user}]})
  let finalMessages = []
  for (let i = (messages.length - 1); i > -1; i--) {
    if (finalMessages.findIndex(elem => (elem.userName === messages[i].from || elem.userName === messages[i].to)) === -1) {
      let from = messages[i].from.replace(user, 'You')
      let messageToShow = from + ": " + messages[i].message
      if (messageToShow.length > 35) {
        messageToShow = messages[i].message.replace(messages[i].message.substring(35), '...')
      }
      if (messages[i].from === user) {
        finalMessages.push({"userName": messages[i].to, "message": messageToShow})
      }
      if (messages[i].to === user) {
        finalMessages.push({"userName": messages[i].from, "message": messageToShow})
      }
    }
  }
  // for (let i = 0; i < finalMessages.length; i++) {
  //   finalMessages[i].userName = finalMessages[i].userName.replace(finalMessages[i].userName.substring(finalMessages[i].userName.indexOf("@")), "")
  // }
  res.json({ success: "Authenticated!", result: finalMessages })
})


//Get Market
router.post("/getmarket", async (req, res) => {
  console.log("getmarket")
  if (!req.body.address) {
    return res.json({error: "Invalid Information!"})
  }
  let result = await Market.find({address: req.body.address, verified: true})
  res.json(result)
})

//Add photo
router.post('/addphoto', upload.array('photo', 3), async (req, res) => {
  console.log('body', req.body);
  if (!req.body.token) {
    return res.json({error: "Invalid Information!"})
  }
  let user = await client.hGetAll(req.body.token)
  if (req.body.firstName && req.body.firstName !== "") {
    await User.updateOne({userName: user.userName}, {$set: {firstName: req.body.firstName}})
    console.log("first name")
  }
  if (req.body.lastName && req.body.lastName !== "") {
    await User.updateOne({userName: user.userName}, {lastName: req.body.lastName})
    console.log("last name")
  }
  if (req.body.phoneNumber && req.body.phoneNumber !== "") {
    await User.updateOne({userName: user.userName}, {phoneNumber: req.body.phoneNumber})
    console.log("phone number")
  }
  if (req.body.photoName && req.body.photoName !== "") {
    console.log("SETTING")
    await client.set("photo" + user.userName, req.body.photoName)
  }
  res.status(200).json({
    message: 'success!',
  });
});

//Check photo
router.post('/checkphoto', async (req, res) => {
  if (!req.body.userName || req.body.userName === "") {
    return res.json({error: "Invalid Information!"})
  }
  let photoName = ""
  try {photoName = await client.get("photo" + req.body.userName)} catch{photoName = "pfp.png"}
  if (!photoName) {
    photoName = "pfp.png"
  }
  return res.json({result: photoName})
});


module.exports = router