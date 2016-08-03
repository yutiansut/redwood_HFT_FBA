Redwood.factory("MarketManager", function () {
   var api = {};

   //Creates the market manager, pass var's that you need for creation in here.
   api.createMarketManager = function (sendFunction, groupNumber, groupManager, debugMode, batchLength) {
      var market = {};

      market.FBABook = {};
      market.FBABook.batchNumber = 1;

      market.groupManager = groupManager;
      market.batchLength = batchLength;

      market.debugMode = debugMode;
      if (debugMode) {
         market.logger = new MessageLogger("Market " + String(groupNumber), "#55FF55", "group-" + groupNumber + "-log");
      }

      // captures the redwood admin send function
      market.rssend = function (key, value) {
         sendFunction(key, value, "admin", 1, groupNumber);
      };

      // abstracts send function so that there is single msg argument
      market.sendToGroupManager = function (message) {
         this.groupManager.recvFromMarket(message);
      };

      // handle message from subjects
      market.recvMessage = function (message) {
         message.timestamp = Date.now();

         if (this.debugMode) {
            this.logger.logRecv(message, "Group Manager");
         }

         var buyOrdersBefore = $.extend(true, [], this.FBABook.buyContracts);
         var sellOrdersBefore = $.extend(true, [], this.FBABook.sellContracts);

         // handle message based on type. Send reply once message has been handled
         switch (message.msgType) {

            // enter buy offer
            case "EBUY":
               //if message is a market order
               if (message.msgData[1] == 214748.3647) {
                  market.FBABook.insertBuy(message.msgData[0], 200000, message.timestamp, message.msgData[3], true, null);
               }
               //if order's price is out of bounds
               else if (message.msgData[1] > 199999.9900 || message.msgData[1] <= 0) {
                  console.error("marketManager: invalid buy price of " + message.msgData[1]);
                  break;
               }
               else {
                  market.FBABook.insertBuy(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2], message.msgData[4]);
               }
               break;

            // enter sell offer
            case "ESELL":
               if (message.msgData[1] == 214748.3647) {
                  market.FBABook.insertSell(message.msgData[0], 0, message.timestamp, message.msgData[3], true, null);
               }
               else if (message.msgData[1] > 199999.9900 || message.msgData[1] <= 0) {
                  console.error("marketManager: invalid sell price of " + message.msgData[1]);
                  break;
               }
               else {
                  market.FBABook.insertSell(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2], message.msgData[4]);
               }
               break;

            // remove buy offer
            case "RBUY":
               market.FBABook.removeBuy(message.msgData[0]);
               break;

            // remove sell offer
            case "RSELL":
               market.FBABook.removeSell(message.msgData[0]);
               break;

            // update buy offer
            case "UBUY":
               market.FBABook.insertBuy(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2], message.msgData[4]);
               break;

            // update sell offer
            case "USELL":
               market.FBABook.insertSell(message.msgData[0], message.msgData[1], message.timestamp, message.msgData[3], message.msgData[2], message.msgData[4]);
               break;

            // message not recognized
            default:
               console.error("marketManager: invalid message type: " + message.msgType);
         }

         if (message.msgType == "EBUY" || message.msgType == "UBUY" || message.msgType == "RBUY") this.groupManager.dataStore.storeBuyOrderState(message.timestamp, this.FBABook.buyContracts, buyOrdersBefore);
         else this.groupManager.dataStore.storeSellOrderState(message.timestamp, this.FBABook.sellContracts, sellOrdersBefore);
      };

      market.FBABook.buyContracts = [];

      market.FBABook.sellContracts = [];

      //inserts buy into buy orders data structure
      market.FBABook.insertBuy = function (newId, newPrice, timestamp, originTimestamp, ioc, state) {
         // if new order isn't from an investor, check to see if an order from this player is already in the book
         if (newId != 0) {
            var index = market.FBABook.buyContracts.findIndex(function (element) {
               return element.id == newId;
            });

            if (index != -1) {
               if (market.FBABook.buyContracts[index].originTimestamp > originTimestamp) {
                  // if the order already in the book is newer, return
                  console.log("stale buy order submitted");
                  return;
               }
               else {
                  // otherwise, remove the old order
                  market.FBABook.buyContracts.splice(index, 1);
               }
            }
         }

         // push the new order onto the list
         // order doesn't matter because list will be sorted when a batch happens
         var order = {id: newId,
            price: newPrice,
            timestamp: timestamp,
            originTimestamp: originTimestamp,
            ioc: ioc,
            state: state,
            transacted: false,
            batchNumber: this.batchNumber
         };
         market.FBABook.buyContracts.push(order);
      };

      //inserts sell into sell orders data structure
      market.FBABook.insertSell = function (newId, newPrice, timestamp, originTimestamp, ioc, state) {
         // check to see if an order from this player is already in the book
         if (newId != 0) {
            var index = market.FBABook.sellContracts.findIndex(function (element) {
               return element.id == newId;
            });

            if (index != -1) {
               if (market.FBABook.sellContracts[index].originTimestamp > originTimestamp) {
                  // if the order already in the book is newer, return
                  console.log("stale sell order submitted");
                  return;
               }
               else {
                  // otherwise, remove the old order
                  market.FBABook.sellContracts.splice(index, 1);
               }
            }
         }

         // push the new order onto the list
         // order doesn't matter because list will be sorted when a batch happens
         var order = {
            id: newId,
            price: newPrice,
            timestamp: timestamp,
            originTimestamp: originTimestamp,
            ioc: ioc,
            state: state,
            transacted: false,
            batchNumber: this.batchNumber
         };
         market.FBABook.sellContracts.push(order);
      };

      //removes buy order associated with a user id from the order book
      market.FBABook.removeBuy = function (idToRemove) {
         var index = market.FBABook.buyContracts.findIndex(function (element) {
            return element.id == idToRemove;
         });

         if (index != -1) {
            market.FBABook.buyContracts.splice(index, 1);
         }
         else {
            console.log("tried to remove nonexistent buy order");
         }
      };

      //removes sell order associated with a user id from the order book
      market.FBABook.removeSell = function (idToRemove) {
         var index = market.FBABook.sellContracts.findIndex(function (element) {
            return element.id == idToRemove;
         });

         if (index != -1) {
            market.FBABook.sellContracts.splice(index, 1);
         }
         else {
            console.log("tried to remove nonexistent sell order");
         }
      };

      market.FBABook.processBatch = function (batchTime) {
         // save initial market state for data logging purposes
         var buyOrdersBefore = $.extend(true, [], this.FBABook.buyContracts);
         var sellOrdersBefore = $.extend(true, [], this.FBABook.sellContracts);

         // if buy and sell orders aren't empty, then there might be some transactions
         if (this.FBABook.buyContracts.length > 0 && this.FBABook.sellContracts.length > 0) {
            // combine and sort buy and sell orders to find clearing price
            var allOrders = this.FBABook.buyContracts.concat(this.FBABook.sellContracts);
            allOrders.sort(function (a, b) {
               return b.price - a.price;
            });

            // calculate equilibrium price
            var equilibriumPrice = (allOrders[this.FBABook.sellContracts.length - 1].price + allOrders[this.FBABook.sellContracts.length].price) / 2;

            // every buy order above equilibrium is transacted and every sell order below equilibrium is transacted
            for (let order of this.FBABook.buyContracts) {
               if (order.price >= equilibriumPrice) order.transacted = true;
            }
            for (let order of this.FBABook.sellContracts) {
               if (order.price <= equilibriumPrice) order.transacted = true;
            }
         }

         var msg = new Message("ITCH", "BATCH", [this.FBABook.buyContracts, this.FBABook.sellContracts, this.FBABook.batchNumber, equilibriumPrice === undefined ? null : equilibriumPrice]);
         this.sendToGroupManager(msg);
         
         // move non-ioc and non-transacted order to next batch
         var newBuyContracts = [];
         for (let order of this.FBABook.buyContracts) {
            if (!order.ioc && !order.transacted) {
               order.batchNumber++;
               newBuyContracts.push(order);
            }
         }
         
         var newSellContracts = [];
         for (let order of this.FBABook.sellContracts) {
            if (!order.ioc && !order.transacted) {
               order.batchNumber++;
               newSellContracts.push(order);
            }
         }
         
         this.FBABook.buyContracts = newBuyContracts;
         this.FBABook.sellContracts = newSellContracts;
         
         this.FBABook.batchNumber++;

         this.groupManager.dataStore.storeBuyOrderState(batchTime, this.FBABook.buyContracts, buyOrdersBefore);
         this.groupManager.dataStore.storeSellOrderState(batchTime, this.FBABook.sellContracts, sellOrdersBefore);

         window.setTimeout(market.FBABook.processBatch, batchTime + this.batchLength - Date.now(), batchTime + this.batchLength);
      }.bind(market);

      // update functions are unused now, insert does both jobs

      //updates a buy order to a new price
      market.FBABook.updateBuy = function (idToUpdate, newPrice, timestamp) {
         if (market.FBABook.removeBuy(idToUpdate) === null) {
            return;
         }
         market.FBABook.insertBuy(idToUpdate, newPrice, timestamp);
      };

      //updates a sell order to a new price
      market.FBABook.updateSell = function (idToUpdate, newPrice, timestamp) {
         if (market.FBABook.removeSell(idToUpdate) === null) {
            return;
         }
         market.FBABook.insertSell(idToUpdate, newPrice, timestamp);
      };

      return market;
   };

   return api;

});
