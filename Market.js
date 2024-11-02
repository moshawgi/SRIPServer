const mongoose  = require("mongoose");
const MarketSchema = new mongoose.Schema({
    address:{
        type:String,
        required:true,
        unique:true
    },
    latitude:{
        type:Number,
        required:true
    },
    longitude:{
        type:Number,
        required:true
    },
    verified:{
        type:Boolean,
        required:true
    },
    foods: {
        type:String,
        required:true
    },
    description: {
        type:String,
        required:true
    }
});
module.exports = mongoose.model('market', MarketSchema)