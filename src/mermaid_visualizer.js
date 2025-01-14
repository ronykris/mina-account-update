"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionVisualizer = void 0;
exports.visualizeTransaction = visualizeTransaction;
// Helper function
function readFileAsString(path) {
    return __awaiter(this, void 0, void 0, function () {
        var response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, window.fs.readFile(path, { encoding: 'utf8' })];
                case 1:
                    response = _a.sent();
                    if (response instanceof Uint8Array) {
                        return [2 /*return*/, new TextDecoder().decode(response)];
                    }
                    return [2 /*return*/, response];
            }
        });
    });
}
var TransactionVisualizer = /** @class */ (function () {
    function TransactionVisualizer(data, config) {
        if (config === void 0) { config = {}; }
        var _a, _b, _c;
        this.data = data;
        this.config = {
            nodePrefix: (_a = config.nodePrefix) !== null && _a !== void 0 ? _a : 'A',
            showUsdValues: (_b = config.showUsdValues) !== null && _b !== void 0 ? _b : false,
            detailedTransactionInfo: (_c = config.detailedTransactionInfo) !== null && _c !== void 0 ? _c : true
        };
    }
    TransactionVisualizer.prototype.shortenAddress = function (address) {
        if (!address)
            throw new Error('Invalid address provided');
        return "".concat(address.slice(0, 6), "...").concat(address.slice(-6));
    };
    TransactionVisualizer.prototype.getNodeStyle = function (account) {
        if (account.isZkappAccount)
            return 'zkapp';
        return account.totalBalanceChange >= 0 ? 'normal' : 'negative';
    };
    TransactionVisualizer.prototype.formatBalance = function (balance, includeUsd) {
        if (includeUsd === void 0) { includeUsd = false; }
        var formatted = "".concat(balance, " MINA");
        if (includeUsd && this.config.showUsdValues) {
            var usdValue = (balance * this.data.feeUsd / this.data.fee).toFixed(2);
            formatted += " ($".concat(usdValue, ")");
        }
        return formatted;
    };
    TransactionVisualizer.prototype.addStyleDefinitions = function () {
        return [
            'graph TB',
            'classDef zkapp fill:#e6e6fa,stroke:#333,stroke-width:2px',
            'classDef normal fill:#add8e6,stroke:#333,stroke-width:2px',
            'classDef negative fill:#ffb6c1,stroke:#333,stroke-width:2px'
        ];
    };
    TransactionVisualizer.prototype.generateNodes = function () {
        var _this = this;
        var nodes = [];
        var nodeMap = new Map();
        this.data.updatedAccounts.forEach(function (account, index) {
            var nodeId = _this.generateNodeId(index);
            var shortAddr = _this.shortenAddress(account.accountAddress);
            var balance = _this.formatBalance(account.totalBalanceChange, true);
            var style = _this.getNodeStyle(account);
            nodes.push("".concat(nodeId, "[").concat(shortAddr, "<br/>Balance: ").concat(balance, "]:::").concat(style));
            nodeMap.set(account.accountAddress, nodeId);
        });
        return { nodes: nodes, nodeMap: nodeMap };
    };
    TransactionVisualizer.prototype.generateNodeId = function (index) {
        return "".concat(this.config.nodePrefix).concat(index);
    };
    TransactionVisualizer.prototype.generateEdges = function (nodeMap) {
        var _this = this;
        var edges = [];
        var senders = this.data.updatedAccounts.filter(function (acc) { return acc.totalBalanceChange < 0; });
        var receivers = this.data.updatedAccounts.filter(function (acc) { return acc.totalBalanceChange > 0; });
        senders.forEach(function (sender) {
            receivers.forEach(function (receiver) {
                var senderId = nodeMap.get(sender.accountAddress);
                var receiverId = nodeMap.get(receiver.accountAddress);
                if (senderId && receiverId) {
                    var amount = Math.abs(sender.totalBalanceChange);
                    var label = _this.formatBalance(amount, true);
                    edges.push("".concat(senderId, " -->|\"").concat(label, "\"| ").concat(receiverId));
                }
            });
        });
        return edges;
    };
    TransactionVisualizer.prototype.generateTransactionInfo = function () {
        var info = ['subgraph Transaction Info'];
        if (this.config.detailedTransactionInfo) {
            info.push("TxHash[TX: ".concat(this.shortenAddress(this.data.txHash), "]"), "Memo[Memo: ".concat(this.data.memo, "]"), "Block[Block: ".concat(this.data.blockHeight, "]"), "Fee[Fee: ".concat(this.formatBalance(this.data.fee, true), "]"), "Status[Status: ".concat(this.data.txStatus, "]"), "Time[Time: ".concat(new Date(this.data.timestamp).toISOString(), "]"));
        }
        else {
            info.push("TxHash[TX: ".concat(this.shortenAddress(this.data.txHash), "]"), "Memo[Memo: ".concat(this.data.memo, "]"), "Block[Block: ".concat(this.data.blockHeight, "]"));
        }
        info.push('end');
        return info;
    };
    TransactionVisualizer.prototype.generateMermaidCode = function () {
        try {
            var styles = this.addStyleDefinitions();
            var _a = this.generateNodes(), nodes = _a.nodes, nodeMap = _a.nodeMap;
            var edges = this.generateEdges(nodeMap);
            var txInfo = this.generateTransactionInfo();
            return __spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray(__spreadArray([], styles, true), [
                ''
            ], false), nodes, true), [
                ''
            ], false), edges, true), [
                ''
            ], false), txInfo, true).join('\n');
        }
        catch (error) {
            throw new Error("Failed to generate Mermaid code: ".concat(error instanceof Error ? error.message : 'Unknown error'));
        }
    };
    return TransactionVisualizer;
}());
exports.TransactionVisualizer = TransactionVisualizer;
// Main visualization function
function visualizeTransaction() {
    return __awaiter(this, void 0, void 0, function () {
        var fileContent, txData, config, visualizer, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, readFileAsString('dummy_data.txt')];
                case 1:
                    fileContent = _a.sent();
                    txData = JSON.parse(fileContent);
                    config = {
                        showUsdValues: true,
                        detailedTransactionInfo: true
                    };
                    visualizer = new TransactionVisualizer(txData, config);
                    return [2 /*return*/, visualizer.generateMermaidCode()];
                case 2:
                    error_1 = _a.sent();
                    throw new Error("Error processing transaction: ".concat(error_1 instanceof Error ? error_1.message : 'Unknown error'));
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Execute
visualizeTransaction().then(console.log).catch(console.error);
