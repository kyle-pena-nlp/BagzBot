class Position {
    constructor(positionID,userID,type,token,tokenPair,amount,status,highestFillPrice) {
        this.positionID = positionID;
        this.userID = userID;
        this.type = type;
        this.token = token;
        this.tokenPair = tokenPair;
        this.amount = amount;
        this.status = status;
        this.highestFillPrice = highestFillPrice;
    }
}