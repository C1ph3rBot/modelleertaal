(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.evaluator_js = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
    Interpreter for Modelleertaal (modelregels)
    Simple dynamical models for highschool Physics in NL

    The language is described in modelleertaal.jison

    usage:
      npm install path_to/jison
      node interpreter.js
*/


//jshint node:true
//jshint devel:true
//jshint evil:true
//jshint es3:true
"use strict";

// parser compiled on execution by jison.js
var modelmodule = require("./model.js");
var parser = require("./modelleertaal").parser;

/*
 Class namespace

 Variables are created in this.varNames = {} (a list of variable names)

 Startwaarden are copied to this.constNames and varNames are erased after
 parsing "startwaarden.txt". This is a trick to keep startwaarden seperate
*/

function Namespace() {

    // prefix to prevent variable name collision with reserved words
    this.varPrefix = "var_";

    this.varNames = []; // list of created variables
    this.constNames = []; // list of startwaarden that remain constant in execution
    // dictionary that converts Modelleertaal identifiers (with illegal
    //  chars [] {} in name) to javascipt identifiers
    this.varDict = {};
}

if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (obj, fromIndex) {
    if (fromIndex === null) {
        fromIndex = 0;
    } else if (fromIndex < 0) {
        fromIndex = Math.max(0, this.length + fromIndex);
    }
    for (var i = fromIndex, j = this.length; i < j; i++) {
        if (this[i] === obj)
            return i;
    }
    return -1;
  };
}

// remove javascript illegal or special char from variable names
Namespace.prototype.mangleName= function(string) {
    return this.varPrefix + string.replace('\{','_lA_').replace('\}','_rA_').replace('\[','_lH_').replace('\]','_rH_').replace('\|','_I_');
};

// create (or reference) variable that is on the left side of an assignment
Namespace.prototype.createVar = function(name) {
    if (this.varNames.indexOf(name) == -1)  {
        this.varNames.push(name);
    }
    this.varDict[name] = this.mangleName(name);
    return this.varDict[name];
};

// reference a variable that is on the right side of an assignment
// It should already exist if on the right side
Namespace.prototype.referenceVar = function(name) {

    // it should exist (but perhaps in "startwaarden" (constNames))
    if ((this.varNames.indexOf(name) == -1) && (this.constNames.indexOf(name) == -1)) {
        throw new Error('Namespace: referenced variable unknown: ', name);
    }
    return this.varDict[name];
};

Namespace.prototype.listAllVars = function() {
    // should really throw exception?
    console.log("WARNING: called obsolete function namespace.listAllVars()");
    return this.varNames;
};

Namespace.prototype.removePrefix = function(name) {

    var regex = new RegExp("^" + this.varPrefix);
    return name.replace(regex, '');
};


Namespace.prototype.moveStartWaarden = function () {
    this.constNames = this.varNames;
    this.varNames = [];
};

Array.prototype.swap = function(a, b) {
    this[a] = this.splice(b, 1, this[a])[0];
    return this;
};

Namespace.prototype.sortVarNames = function () {
    /* sort varNames. "Stock" variables (t, x, s) come first.
       enables automatic graphs of important variables */

    // now sorts on variable NAME. Should identify stock variables in AST.

    // names of "special"variable names to sort, sort if found in order given
    var nameList = ['t', 's', 'x', 'y', 'h', 'v', 'vx', 'vy'];
    var nextVariableIndex = 0 ; // place to swap next "special"variable with

    /*  nextVariableIndex = 0
        for variable in nameList:
            if variable in this.varNames:
                swap variable with variable at nextVariableIndex
                nextVariableIndex += 1
    */
    for (var i = 0; i < nameList.length; i++) {
        var varNames_position = this.varNames.indexOf(nameList[i]);
        if (varNames_position != -1) {
            // swap and *afterwards* increase nextVariableIndex
            this.varNames.swap(varNames_position, nextVariableIndex++); }
    }
};


/*
 Class Codegenerator
 */
function CodeGenerator(namespace) {
    if (typeof namespace === 'undefined') {
        this.namespace = new Namespace();
    } else {
        this.namespace = namespace;
    }
}

CodeGenerator.prototype.setNamespace = function(namespace) {
    this.namespace = namespace; // storage for variable names
};

CodeGenerator.prototype.generateVariableStorageCode = function() {
    var code = 'storage[i] = [];\n';
    for (var i = 0; i < this.namespace.varNames.length; i++) {
        var variable = this.namespace.varDict[this.namespace.varNames[i]];
        code += "storage[i].push("+variable+");\n";
    }
    return code;
};

CodeGenerator.prototype.generateStartWaardenStorageCode = function() {
    var code = 'storage[0] = [];\n';
    for (var i = 0; i < this.namespace.varNames.length; i++) {
        var variable = this.namespace.varDict[this.namespace.varNames[i]];
        code += "if (typeof("+variable+") == 'undefined') "+variable+"=0;\n" +
        "storage[0].push("+variable+");\n";
    }
    return code;
};


CodeGenerator.prototype.generateCodeFromAst = function(ast) {

    var code = "";
    for (var i = 0; i < ast.length; i++) {
        //console.log("AST item = ",ast[i])
        code += this.parseNode(ast[i]);

    }
    return code;
};




CodeGenerator.prototype.parseNode = function(node) {
    /* parseNode is a recursive function that parses an item
        of the JSON AST. Calls itself to traverse through nodes.

        :param: node = (part of) JSON tree
    */

    /* javascript code generation inspired by:
        http://lisperator.net/pltut/compiler/js-codegen */

    switch(node.type) {

        case 'Assignment':
                return this.namespace.createVar(node.left) + ' = (' + this.parseNode(node.right) + ');\n';
        case 'Variable':
                return this.namespace.referenceVar(node.name);
        case 'Binary': {
                    if (node.operator == '^')
                        return "(Math.pow("+this.parseNode(node.left)+","+this.parseNode(node.right)+"))";
                    else
                        return "(" + this.parseNode(node.left) + node.operator + this.parseNode(node.right) + ")";
                    break;
                    }
        case 'Unary':
                    switch(node.operator) {
                        case '+':   return "(" + this.parseNode(node.right) + ")";
                        case '-':   return "(-1. * " + this.parseNode(node.right) + ")";
                        case 'NOT':  return "!("+ this.parseNode(node.right) + ")";
                        default:
                            throw new Error("Unknown unary:" + JSON.stringify(node));
                    }
        /* falls through */
        case 'Logical':
                return "(" + this.parseNode(node.left) + node.operator + this.parseNode(node.right) + ")";
        case 'If':
                return "if (" + this.parseNode(node.cond) + ") {\n" + this.generateCodeFromAst(node.then) + " }\n; ";
        case 'IfElse':
                return "if (" + this.parseNode(node.cond) + ") {\n" + this.generateCodeFromAst(node.then) + " \n} else {\n" +
                this.generateCodeFromAst(node.elsestmt) + " }\n; ";
        case 'Function': {
                switch(node.func.toLowerCase()) {
                    case 'sin': return "Math.sin(("+this.parseNode(node.expr)+")/180.*Math.PI)";
                    case 'cos': return "Math.cos(("+this.parseNode(node.expr)+")/180.*Math.PI)";
                    case 'tan': return "Math.tan(("+this.parseNode(node.expr)+")/180.*Math.PI)";
                    case 'arcsin': return "Math.asin("+this.parseNode(node.expr)+")";
                    case 'arccos': return "Math.acos("+this.parseNode(node.expr)+")";
                    case 'arctan': return "Math.atan("+this.parseNode(node.expr)+")";
                    case 'exp': return "Math.exp("+this.parseNode(node.expr)+")";
                    case 'ln':  return "Math.log("+this.parseNode(node.expr)+")";
                    case 'sqrt': return "Math.sqrt("+this.parseNode(node.expr)+")";
                    default:
                        throw new Error("Unkown function:" + JSON.stringify(node));
                    }
                break;
                }
        case 'Number':
                return parseFloat(node.value.replace(',','.'));
        case 'True':
                return 'true';
        case 'False':
                return 'false';
        case 'Stop':
                return 'throw \'StopIteration\'';
        default:
            throw new Error("Unable to parseNode() :" + JSON.stringify(node));
    } /* switch (node.type) */


}; /* end of parseNode()  */
// end of javascriptCodeGenerator()


function ModelregelsEvaluator(model, debug) {
    if (typeof debug === 'undefined') {
        this.debug = false;
    } else {
        this.debug = debug;
    }

    this.namespace = new Namespace();
    this.codegenerator = new CodeGenerator(this.namespace);

    if (typeof model === 'undefined') {
        this.model = new modelmodule.Model();
    } else {
        this.model = model;
    }

    if (this.debug) {
        console.log('*** input ***');
        console.log(this.model.startwaarden);
        console.log(this.model.modelregels);
    }

    this.startwaarden_ast = parser.parse(this.model.startwaarden);
    this.modelregels_ast = parser.parse(this.model.modelregels);

    if (this.debug) {
        console.log('*** AST startwaarden ***');
        console.log(JSON.stringify(this.startwaarden_ast, undefined, 4));
        console.log('*** AST modelregels ***');
        console.log(JSON.stringify(this.modelregels_ast, undefined, 4));
        console.log('');
    }

}

ModelregelsEvaluator.prototype.run = function(N) {

    var startwaarden_code = this.codegenerator.generateCodeFromAst(this.startwaarden_ast);
    this.namespace.moveStartWaarden(); // keep namespace clean
    var modelregels_code = this.codegenerator.generateCodeFromAst(this.modelregels_ast);
    this.namespace.sortVarNames(); // sort variable names for better output

    // separate function run_model() inside anonymous Function()
    // to prevent bailout of the V8 optimising compiler in try {} catch
    var model =     "function run_model(N, storage) { \n " +
                    startwaarden_code + "\n" +
                    this.codegenerator.generateStartWaardenStorageCode() +
                    "    for (var i=1; i < N; i++) { \n " +
                    modelregels_code + "\n" +
                    this.codegenerator.generateVariableStorageCode() +
                    "    }  \n" +
                    " return;} \n" +
                 "    var results = []; \n " +
                 "    try \n" +
                 "  { \n" +
                 "      run_model(N, results); \n" +
                 "  } catch (e) \n" +
                 "  { console.log(e)} \n " +
                 "return results;\n";

    if (this.debug) {
        console.log('*** generated js ***');
        console.log(model);
        console.log("*** running! *** ");
        console.log("N = ", N);
    }

    var t1 = Date.now();

    // eval(model); // slow... in chrome >23
    //  the optimising compiler does not optimise eval() in local scope
    //  http://moduscreate.com/javascript-performance-tips-tricks/
    var runModel = new Function('N', model);
    var result = runModel(N);

    var t2 = Date.now();

    console.log("Number of iterations: ", result.length);
    console.log("Time: " + (t2 - t1) + "ms");

    return result;

};

exports.Model = modelmodule.Model; // from model.js
exports.ModelregelsEvaluator = ModelregelsEvaluator;
exports.CodeGenerator = CodeGenerator;
exports.Namespace = Namespace;

},{"./model.js":2,"./modelleertaal":3}],2:[function(require,module,exports){
/*
 model.js

 Model Class

 read a from model.xml
 store model in string etc


 model.xml example:

 <modelleertaal>
 <startwaarden>
     Fmotor = 500 'N
     m = 800 'kg
     dt = 1e-2 's
     v = 0'm/s
     s = 0 'm/s
     t = 0 's
 </startwaarden>
 <modelregels>
     Fres= Fmotor
     a = Fres/m
     dv = a * dt
     v = v + dv
     ds = v * dt
     s = s + ds
     t = t + dt
     als (0)
     dan
       Stop
     EindAls
 </modelregels>

 </modelleertaal>
*/


//jshint es3:true

var fs = require('fs');

function Model() {
    this.modelregels = '';
    this.startwaarden = '';
}


Model.prototype.readBogusXMLFile = function(filename) {
    // This read a "bogus" XML file that still includes < instead of &lt;
    var buf = fs.readFileSync(filename, "utf8");

    this.parseBogusXMLString(buf);
};

Model.prototype.parseBogusXMLString = function(xmlString) {

    var action = 0; // 0 = do nothing, 1 = modelregels, 2 = startwaarden

    this.startwaarden = '';
    this.modelregels = '';

    var lines = xmlString.split('\n');

    for(var line = 1; line < lines.length; line++) {

        //console.log(action, lines[line]);

        switch(lines[line].replace('\r','')) {
            // < and > mess things up in the browser
            case '<modelregels>': { action = 1; continue; }
            case '</modelregels>': { action = 0; continue; }
            case '<startwaarden>': { action = 2; continue; }
            case '</startwaarden>': { action = 0; continue; }
        }
        if (action==1) this.modelregels += lines[line]+'\n';
        if (action==2) this.startwaarden += lines[line]+'\n';
    }
    //console.log('DEBUG: in model.js parseBogusXMLString endresult this.modelregels:');
    //console.log(this.modelregels);
    //console.log('DEBUG: in model.js parseBogusXMLString endresult this.startwaarden:');
    //console.log(this.startwaarden);

};

Model.prototype.createBogusXMLString = function() {

    return '<modelleertaal>\n<startwaarden>\n' +
            this.startwaarden +
            '</startwaarden>\n<modelregels>\n' +
            this.modelregels +
            '</modelregels>\n</modelleertaal>\n';
};



exports.Model = Model;

},{"fs":4}],3:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.18 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var parser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[1,4],$V1=[1,5],$V2=[1,6],$V3=[5,7,10,13,14,15],$V4=[1,21],$V5=[1,16],$V6=[1,14],$V7=[1,13],$V8=[1,15],$V9=[1,17],$Va=[1,18],$Vb=[1,19],$Vc=[1,20],$Vd=[1,24],$Ve=[1,25],$Vf=[1,26],$Vg=[1,27],$Vh=[1,28],$Vi=[1,29],$Vj=[1,30],$Vk=[1,31],$Vl=[1,32],$Vm=[1,33],$Vn=[5,7,10,12,13,14,15,18,19,20,21,22,23,24,25,26,27,28],$Vo=[5,7,10,12,13,14,15,18,25,26],$Vp=[5,7,10,12,13,14,15,18,24,25,26,27,28],$Vq=[5,7,10,12,13,14,15,18,25,26,27,28];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"program":3,"stmt_list":4,"EOF":5,"stmt":6,"IDENT":7,"ASSIGN":8,"expr":9,"IF":10,"condition":11,"THEN":12,"ENDIF":13,"ELSE":14,"STOP":15,"direct_declarator":16,"(":17,")":18,"==":19,">":20,">=":21,"<":22,"<=":23,"^":24,"+":25,"-":26,"*":27,"/":28,"NOT":29,"NUMBER":30,"PI":31,"TRUE":32,"FALSE":33,"$accept":0,"$end":1},
terminals_: {2:"error",5:"EOF",7:"IDENT",8:"ASSIGN",10:"IF",12:"THEN",13:"ENDIF",14:"ELSE",15:"STOP",17:"(",18:")",19:"==",20:">",21:">=",22:"<",23:"<=",24:"^",25:"+",26:"-",27:"*",28:"/",29:"NOT",30:"NUMBER",31:"PI",32:"TRUE",33:"FALSE"},
productions_: [0,[3,2],[4,1],[4,2],[6,3],[6,5],[6,7],[6,1],[11,1],[16,1],[16,4],[9,1],[9,3],[9,3],[9,3],[9,3],[9,3],[9,3],[9,3],[9,3],[9,3],[9,3],[9,2],[9,2],[9,2],[9,3],[9,1],[9,1],[9,1],[9,1]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:
 return($$[$0-1]); 
break;
case 2:
 this.$ = [$$[$0]]; 
break;
case 3:
 $$[$0-1].push($$[$0]); this.$ = $$[$0-1]; 
break;
case 4:
 this.$ = {
                type: 'Assignment',
                left: $$[$0-2],
                right: $$[$0]

            };
        
break;
case 5:
 this.$ = {
                type: 'If',
                cond: $$[$0-3],
                then: $$[$0-1]
            };
        
break;
case 6:
 this.$ = {
              type: 'IfElse',
              cond: $$[$0-5],
              then: $$[$0-3],
              elsestmt: $$[$0-1]
          };
      
break;
case 7:
this.$ = {
                 type: 'Stop',
                 value: $$[$0]
            };
        
break;
case 8: case 11:
this.$ = $$[$0];
break;
case 9:
 this.$ = {
                  type: 'Variable',
                  name: yytext
              };
          
break;
case 10:
this.$ = {
              type: 'Function',
              func: $$[$0-3],
              expr: $$[$0-1]
      };
  
break;
case 12:
this.$ = {
               type: 'Logical',
               operator: '==',
               left: $$[$0-2],
               right: $$[$0]
       };
   
break;
case 13:
this.$ = {
              type: 'Logical',
              operator: '>',
              left: $$[$0-2],
              right: $$[$0]
      };
  
break;
case 14:
this.$ = {
                type: 'Logical',
                operator: '>=',
                left: $$[$0-2],
                right: $$[$0]
        };
    
break;
case 15:
this.$ = {
               type: 'Logical',
               operator: '<',
               left: $$[$0-2],
               right: $$[$0]
       };
   
break;
case 16:
this.$ = {
                  type: 'Logical',
                  operator: '<=',
                  left: $$[$0-2],
                  right: $$[$0]
          };
      
break;
case 17:
this.$ = {
                 type: 'Binary',
                 operator: '^',
                 left: $$[$0-2],
                 right: $$[$0]
           };
         
break;
case 18:
this.$ = {
                type: 'Binary',
                operator: '+',
                left: $$[$0-2],
                right: $$[$0]
          };
        
break;
case 19:
this.$ = {
                 type: 'Binary',
                 operator: '-',
                 left: $$[$0-2],
                 right: $$[$0]
           };
         
break;
case 20:
this.$ = {
                 type: 'Binary',
                 operator: '*',
                 left: $$[$0-2],
                 right: $$[$0]
           };
         
break;
case 21:
this.$ = {
               type: 'Binary',
               operator: '/',
               left: $$[$0-2],
               right: $$[$0]
         };
       
break;
case 22:
this.$ = {
                  type: 'Unary',
                  operator: '-',
                  right: $$[$0]
            };
          
break;
case 23:
this.$ = {
                  type: 'Unary',
                  operator: '+',
                  right: $$[$0]
            };
          
break;
case 24:
this.$ = {
                type: 'Unary',
                operator: 'NOT',
                right: $$[$0]
          };
        
break;
case 25:
this.$ = $$[$0-1];
break;
case 26:
this.$ = {
                  type: 'Number',
                  value: $$[$0]
              };
           
break;
case 27:
this.$ = {
              type: 'Number',
              value: "3.14159265359"
          };
       
break;
case 28:
this.$ = {
                type: 'True',
                value: $$[$0]
            };
         
break;
case 29:
this.$ = {
                type: 'False',
                value: $$[$0]
            };
         
break;
}
},
table: [{3:1,4:2,6:3,7:$V0,10:$V1,15:$V2},{1:[3]},{5:[1,7],6:8,7:$V0,10:$V1,15:$V2},o($V3,[2,2]),{8:[1,9]},{7:$V4,9:11,11:10,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},o($V3,[2,7]),{1:[2,1]},o($V3,[2,3]),{7:$V4,9:22,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{12:[1,23]},{12:[2,8],19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,25:$Vj,26:$Vk,27:$Vl,28:$Vm},o($Vn,[2,11]),{7:$V4,9:34,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:35,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:36,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:37,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},o($Vn,[2,26]),o($Vn,[2,27]),o($Vn,[2,28]),o($Vn,[2,29]),o($Vn,[2,9],{17:[1,38]}),o($V3,[2,4],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,25:$Vj,26:$Vk,27:$Vl,28:$Vm}),{4:39,6:3,7:$V0,10:$V1,15:$V2},{7:$V4,9:40,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:41,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:42,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:43,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:44,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:45,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:46,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:47,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:48,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{7:$V4,9:49,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},o($Vo,[2,22],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,27:$Vl,28:$Vm}),o($Vo,[2,23],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,27:$Vl,28:$Vm}),o($Vp,[2,24],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh}),{18:[1,50],19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,25:$Vj,26:$Vk,27:$Vl,28:$Vm},{7:$V4,9:51,16:12,17:$V5,25:$V6,26:$V7,29:$V8,30:$V9,31:$Va,32:$Vb,33:$Vc},{6:8,7:$V0,10:$V1,13:[1,52],14:[1,53],15:$V2},o([5,7,10,12,13,14,15,18,19,24,25,26,27,28],[2,12],{20:$Ve,21:$Vf,22:$Vg,23:$Vh}),o($Vn,[2,13]),o([5,7,10,12,13,14,15,18,19,21,22,23,24,25,26,27,28],[2,14],{20:$Ve}),o([5,7,10,12,13,14,15,18,19,22,23,24,25,26,27,28],[2,15],{20:$Ve,21:$Vf}),o([5,7,10,12,13,14,15,18,19,23,24,25,26,27,28],[2,16],{20:$Ve,21:$Vf,22:$Vg}),o($Vp,[2,17],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh}),o($Vo,[2,18],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,27:$Vl,28:$Vm}),o($Vo,[2,19],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,27:$Vl,28:$Vm}),o($Vq,[2,20],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi}),o($Vq,[2,21],{19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi}),o($Vn,[2,25]),{18:[1,54],19:$Vd,20:$Ve,21:$Vf,22:$Vg,23:$Vh,24:$Vi,25:$Vj,26:$Vk,27:$Vl,28:$Vm},o($V3,[2,5]),{4:55,6:3,7:$V0,10:$V1,15:$V2},o($Vn,[2,10]),{6:8,7:$V0,10:$V1,13:[1,56],15:$V2},o($V3,[2,6])],
defaultActions: {7:[2,1]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        var error = new Error(str);
        error.hash = hash;
        throw error;
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        var lex = function () {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        };
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};
/* generated by jison-lex 0.3.4 */
var lexer = (function(){
var lexer = ({

EOF:1,

parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },

// resets the lexer, sets new input
setInput:function (input, yy) {
        this.yy = yy || this.yy || {};
        this._input = input;
        this._more = this._backtrack = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
        };
        if (this.options.ranges) {
            this.yylloc.range = [0,0];
        }
        this.offset = 0;
        return this;
    },

// consumes and returns one char from the input
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) {
            this.yylloc.range[1]++;
        }

        this._input = this._input.slice(1);
        return ch;
    },

// unshifts one char (or a string) into the input
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length - 1);
        this.matched = this.matched.substr(0, this.matched.length - 1);

        if (lines.length - 1) {
            this.yylineno -= lines.length - 1;
        }
        var r = this.yylloc.range;

        this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                 + oldLines[oldLines.length - lines.length].length - lines[0].length :
              this.yylloc.first_column - len
        };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        this.yyleng = this.yytext.length;
        return this;
    },

// When called from action, caches matched text and appends it on next action
more:function () {
        this._more = true;
        return this;
    },

// When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
reject:function () {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });

        }
        return this;
    },

// retain first n characters of the match
less:function (n) {
        this.unput(this.match.slice(n));
    },

// displays already matched input, i.e. for error messages
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },

// displays upcoming input, i.e. for error messages
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
    },

// displays the character position where the lexing error occurred, i.e. for error messages
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c + "^";
    },

// test the lexed token: return FALSE when not a match, otherwise return token
test_match:function (match, indexed_rule) {
        var token,
            lines,
            backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(0),
                done: this.done
            };
            if (this.options.ranges) {
                backup.yylloc.range = this.yylloc.range.slice(0);
            }
        }

        lines = match[0].match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno += lines.length;
        }
        this.yylloc = {
            first_line: this.yylloc.last_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.last_column,
            last_column: lines ?
                         lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                         this.yylloc.last_column + match[0].length
        };
        this.yytext += match[0];
        this.match += match[0];
        this.matches = match;
        this.yyleng = this.yytext.length;
        if (this.options.ranges) {
            this.yylloc.range = [this.offset, this.offset += this.yyleng];
        }
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match[0].length);
        this.matched += match[0];
        token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
                this[k] = backup[k];
            }
            return false; // rule action called reject() implying the next rule should be tested instead.
        }
        return false;
    },

// return next match in input
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        var token,
            match,
            tempMatch,
            index;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (this.options.backtrack_lexer) {
                    token = this.test_match(tempMatch, rules[i]);
                    if (token !== false) {
                        return token;
                    } else if (this._backtrack) {
                        match = false;
                        continue; // rule action called reject() implying a rule MISmatch.
                    } else {
                        // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                        return false;
                    }
                } else if (!this.options.flex) {
                    break;
                }
            }
        }
        if (match) {
            token = this.test_match(match, rules[index]);
            if (token !== false) {
                return token;
            }
            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });
        }
    },

// return next match that has a token
lex:function lex() {
        var r = this.next();
        if (r) {
            return r;
        } else {
            return this.lex();
        }
    },

// activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },

// pop the previously active lexer condition state off the condition stack
popState:function popState() {
        var n = this.conditionStack.length - 1;
        if (n > 0) {
            return this.conditionStack.pop();
        } else {
            return this.conditionStack[0];
        }
    },

// produce the lexer rule set which is active for the currently active lexer condition state
_currentRules:function _currentRules() {
        if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        } else {
            return this.conditions["INITIAL"].rules;
        }
    },

// return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
topState:function topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        } else {
            return "INITIAL";
        }
    },

// alias for begin(condition)
pushState:function pushState(condition) {
        this.begin(condition);
    },

// return the number of states currently on the stack
stateStackSize:function stateStackSize() {
        return this.conditionStack.length;
    },
options: {"case-insensitive":true},
performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
var YYSTATE=YY_START;
switch($avoiding_name_collisions) {
case 0:/* ignore whitespaces */
break;
case 1:/* ignore whitespaces */
break;
case 2:/* modelleertaal comment */
break;
case 3:/* C-style multiline comment */
break;
case 4:/* C-style comment */
break;
case 5:/* Python style comment */
break;
case 6:return 17
break;
case 7:return 18
break;
case 8:return 31
break;
case 9:return 19
break;
case 10:return 21
break;
case 11:return 23
break;
case 12:return 20
break;
case 13:return 22
break;
case 14:return 29
break;
case 15:return 33
break;
case 16:return 32
break;
case 17:return 8
break;
case 18:return 8
break;
case 19:return 30
break;
case 20:return 30
break;
case 21:return 30
break;
case 22:return 24
break;
case 23:return 25
break;
case 24:return 26
break;
case 25:return 27
break;
case 26:return 28
break;
case 27:return 13
break;
case 28:return 10
break;
case 29:return 12
break;
case 30:return 15
break;
case 31:return 14
break;
case 32:return 7
break;
case 33:return 5
break;
}
},
rules: [/^(?:\s+)/i,/^(?:\t+)/i,/^(?:'[^\n]*)/i,/^(?:\/\*(.|\n|\r)*?\*\/)/i,/^(?:\/\/[^\n]*)/i,/^(?:#[^\n]*)/i,/^(?:\()/i,/^(?:\))/i,/^(?:pi\b)/i,/^(?:==)/i,/^(?:>=)/i,/^(?:<=)/i,/^(?:>)/i,/^(?:<)/i,/^(?:!|niet\b)/i,/^(?:onwaar\b)/i,/^(?:waar\b)/i,/^(?:=)/i,/^(?::=)/i,/^(?:[0-9]*["."","][0-9]+([Ee][+-]?[0-9]+)?)/i,/^(?:[0-9]+["."","][0-9]*([Ee][+-]?[0-9]+)?)/i,/^(?:[0-9]+([Ee][+-]?[0-9]+)?)/i,/^(?:\^)/i,/^(?:\+)/i,/^(?:-)/i,/^(?:\*)/i,/^(?:\/)/i,/^(?:eindals\b)/i,/^(?:als\b)/i,/^(?:dan\b)/i,/^(?:stop\b)/i,/^(?:anders\b)/i,/^(?:[a-zA-Z][a-zA-Z0-9_"\]""\|"{}"["]*)/i,/^(?:$)/i],
conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33],"inclusive":true}}
});
return lexer;
})();
parser.lexer = lexer;
function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = parser;
exports.Parser = parser.Parser;
exports.parse = function () { return parser.parse.apply(parser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))

},{"_process":6,"fs":4,"path":5}],4:[function(require,module,exports){

},{}],5:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))

},{"_process":6}],6:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJldmFsdWF0b3IuanMiLCJtb2RlbC5qcyIsIm1vZGVsbGVlcnRhYWwuanMiLCJub2RlX21vZHVsZXMvZ3J1bnQtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNuMkJBOzs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNoT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLypcbiAgICBJbnRlcnByZXRlciBmb3IgTW9kZWxsZWVydGFhbCAobW9kZWxyZWdlbHMpXG4gICAgU2ltcGxlIGR5bmFtaWNhbCBtb2RlbHMgZm9yIGhpZ2hzY2hvb2wgUGh5c2ljcyBpbiBOTFxuXG4gICAgVGhlIGxhbmd1YWdlIGlzIGRlc2NyaWJlZCBpbiBtb2RlbGxlZXJ0YWFsLmppc29uXG5cbiAgICB1c2FnZTpcbiAgICAgIG5wbSBpbnN0YWxsIHBhdGhfdG8vamlzb25cbiAgICAgIG5vZGUgaW50ZXJwcmV0ZXIuanNcbiovXG5cblxuLy9qc2hpbnQgbm9kZTp0cnVlXG4vL2pzaGludCBkZXZlbDp0cnVlXG4vL2pzaGludCBldmlsOnRydWVcbi8vanNoaW50IGVzMzp0cnVlXG5cInVzZSBzdHJpY3RcIjtcblxuLy8gcGFyc2VyIGNvbXBpbGVkIG9uIGV4ZWN1dGlvbiBieSBqaXNvbi5qc1xudmFyIG1vZGVsbW9kdWxlID0gcmVxdWlyZShcIi4vbW9kZWwuanNcIik7XG52YXIgcGFyc2VyID0gcmVxdWlyZShcIi4vbW9kZWxsZWVydGFhbFwiKS5wYXJzZXI7XG5cbi8qXG4gQ2xhc3MgbmFtZXNwYWNlXG5cbiBWYXJpYWJsZXMgYXJlIGNyZWF0ZWQgaW4gdGhpcy52YXJOYW1lcyA9IHt9IChhIGxpc3Qgb2YgdmFyaWFibGUgbmFtZXMpXG5cbiBTdGFydHdhYXJkZW4gYXJlIGNvcGllZCB0byB0aGlzLmNvbnN0TmFtZXMgYW5kIHZhck5hbWVzIGFyZSBlcmFzZWQgYWZ0ZXJcbiBwYXJzaW5nIFwic3RhcnR3YWFyZGVuLnR4dFwiLiBUaGlzIGlzIGEgdHJpY2sgdG8ga2VlcCBzdGFydHdhYXJkZW4gc2VwZXJhdGVcbiovXG5cbmZ1bmN0aW9uIE5hbWVzcGFjZSgpIHtcblxuICAgIC8vIHByZWZpeCB0byBwcmV2ZW50IHZhcmlhYmxlIG5hbWUgY29sbGlzaW9uIHdpdGggcmVzZXJ2ZWQgd29yZHNcbiAgICB0aGlzLnZhclByZWZpeCA9IFwidmFyX1wiO1xuXG4gICAgdGhpcy52YXJOYW1lcyA9IFtdOyAvLyBsaXN0IG9mIGNyZWF0ZWQgdmFyaWFibGVzXG4gICAgdGhpcy5jb25zdE5hbWVzID0gW107IC8vIGxpc3Qgb2Ygc3RhcnR3YWFyZGVuIHRoYXQgcmVtYWluIGNvbnN0YW50IGluIGV4ZWN1dGlvblxuICAgIC8vIGRpY3Rpb25hcnkgdGhhdCBjb252ZXJ0cyBNb2RlbGxlZXJ0YWFsIGlkZW50aWZpZXJzICh3aXRoIGlsbGVnYWxcbiAgICAvLyAgY2hhcnMgW10ge30gaW4gbmFtZSkgdG8gamF2YXNjaXB0IGlkZW50aWZpZXJzXG4gICAgdGhpcy52YXJEaWN0ID0ge307XG59XG5cbmlmICghQXJyYXkucHJvdG90eXBlLmluZGV4T2YpIHtcbiAgQXJyYXkucHJvdG90eXBlLmluZGV4T2YgPSBmdW5jdGlvbiAob2JqLCBmcm9tSW5kZXgpIHtcbiAgICBpZiAoZnJvbUluZGV4ID09PSBudWxsKSB7XG4gICAgICAgIGZyb21JbmRleCA9IDA7XG4gICAgfSBlbHNlIGlmIChmcm9tSW5kZXggPCAwKSB7XG4gICAgICAgIGZyb21JbmRleCA9IE1hdGgubWF4KDAsIHRoaXMubGVuZ3RoICsgZnJvbUluZGV4KTtcbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IGZyb21JbmRleCwgaiA9IHRoaXMubGVuZ3RoOyBpIDwgajsgaSsrKSB7XG4gICAgICAgIGlmICh0aGlzW2ldID09PSBvYmopXG4gICAgICAgICAgICByZXR1cm4gaTtcbiAgICB9XG4gICAgcmV0dXJuIC0xO1xuICB9O1xufVxuXG4vLyByZW1vdmUgamF2YXNjcmlwdCBpbGxlZ2FsIG9yIHNwZWNpYWwgY2hhciBmcm9tIHZhcmlhYmxlIG5hbWVzXG5OYW1lc3BhY2UucHJvdG90eXBlLm1hbmdsZU5hbWU9IGZ1bmN0aW9uKHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLnZhclByZWZpeCArIHN0cmluZy5yZXBsYWNlKCdcXHsnLCdfbEFfJykucmVwbGFjZSgnXFx9JywnX3JBXycpLnJlcGxhY2UoJ1xcWycsJ19sSF8nKS5yZXBsYWNlKCdcXF0nLCdfckhfJykucmVwbGFjZSgnXFx8JywnX0lfJyk7XG59O1xuXG4vLyBjcmVhdGUgKG9yIHJlZmVyZW5jZSkgdmFyaWFibGUgdGhhdCBpcyBvbiB0aGUgbGVmdCBzaWRlIG9mIGFuIGFzc2lnbm1lbnRcbk5hbWVzcGFjZS5wcm90b3R5cGUuY3JlYXRlVmFyID0gZnVuY3Rpb24obmFtZSkge1xuICAgIGlmICh0aGlzLnZhck5hbWVzLmluZGV4T2YobmFtZSkgPT0gLTEpICB7XG4gICAgICAgIHRoaXMudmFyTmFtZXMucHVzaChuYW1lKTtcbiAgICB9XG4gICAgdGhpcy52YXJEaWN0W25hbWVdID0gdGhpcy5tYW5nbGVOYW1lKG5hbWUpO1xuICAgIHJldHVybiB0aGlzLnZhckRpY3RbbmFtZV07XG59O1xuXG4vLyByZWZlcmVuY2UgYSB2YXJpYWJsZSB0aGF0IGlzIG9uIHRoZSByaWdodCBzaWRlIG9mIGFuIGFzc2lnbm1lbnRcbi8vIEl0IHNob3VsZCBhbHJlYWR5IGV4aXN0IGlmIG9uIHRoZSByaWdodCBzaWRlXG5OYW1lc3BhY2UucHJvdG90eXBlLnJlZmVyZW5jZVZhciA9IGZ1bmN0aW9uKG5hbWUpIHtcblxuICAgIC8vIGl0IHNob3VsZCBleGlzdCAoYnV0IHBlcmhhcHMgaW4gXCJzdGFydHdhYXJkZW5cIiAoY29uc3ROYW1lcykpXG4gICAgaWYgKCh0aGlzLnZhck5hbWVzLmluZGV4T2YobmFtZSkgPT0gLTEpICYmICh0aGlzLmNvbnN0TmFtZXMuaW5kZXhPZihuYW1lKSA9PSAtMSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdOYW1lc3BhY2U6IHJlZmVyZW5jZWQgdmFyaWFibGUgdW5rbm93bjogJywgbmFtZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnZhckRpY3RbbmFtZV07XG59O1xuXG5OYW1lc3BhY2UucHJvdG90eXBlLmxpc3RBbGxWYXJzID0gZnVuY3Rpb24oKSB7XG4gICAgLy8gc2hvdWxkIHJlYWxseSB0aHJvdyBleGNlcHRpb24/XG4gICAgY29uc29sZS5sb2coXCJXQVJOSU5HOiBjYWxsZWQgb2Jzb2xldGUgZnVuY3Rpb24gbmFtZXNwYWNlLmxpc3RBbGxWYXJzKClcIik7XG4gICAgcmV0dXJuIHRoaXMudmFyTmFtZXM7XG59O1xuXG5OYW1lc3BhY2UucHJvdG90eXBlLnJlbW92ZVByZWZpeCA9IGZ1bmN0aW9uKG5hbWUpIHtcblxuICAgIHZhciByZWdleCA9IG5ldyBSZWdFeHAoXCJeXCIgKyB0aGlzLnZhclByZWZpeCk7XG4gICAgcmV0dXJuIG5hbWUucmVwbGFjZShyZWdleCwgJycpO1xufTtcblxuXG5OYW1lc3BhY2UucHJvdG90eXBlLm1vdmVTdGFydFdhYXJkZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5jb25zdE5hbWVzID0gdGhpcy52YXJOYW1lcztcbiAgICB0aGlzLnZhck5hbWVzID0gW107XG59O1xuXG5BcnJheS5wcm90b3R5cGUuc3dhcCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICB0aGlzW2FdID0gdGhpcy5zcGxpY2UoYiwgMSwgdGhpc1thXSlbMF07XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG5OYW1lc3BhY2UucHJvdG90eXBlLnNvcnRWYXJOYW1lcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAvKiBzb3J0IHZhck5hbWVzLiBcIlN0b2NrXCIgdmFyaWFibGVzICh0LCB4LCBzKSBjb21lIGZpcnN0LlxuICAgICAgIGVuYWJsZXMgYXV0b21hdGljIGdyYXBocyBvZiBpbXBvcnRhbnQgdmFyaWFibGVzICovXG5cbiAgICAvLyBub3cgc29ydHMgb24gdmFyaWFibGUgTkFNRS4gU2hvdWxkIGlkZW50aWZ5IHN0b2NrIHZhcmlhYmxlcyBpbiBBU1QuXG5cbiAgICAvLyBuYW1lcyBvZiBcInNwZWNpYWxcInZhcmlhYmxlIG5hbWVzIHRvIHNvcnQsIHNvcnQgaWYgZm91bmQgaW4gb3JkZXIgZ2l2ZW5cbiAgICB2YXIgbmFtZUxpc3QgPSBbJ3QnLCAncycsICd4JywgJ3knLCAnaCcsICd2JywgJ3Z4JywgJ3Z5J107XG4gICAgdmFyIG5leHRWYXJpYWJsZUluZGV4ID0gMCA7IC8vIHBsYWNlIHRvIHN3YXAgbmV4dCBcInNwZWNpYWxcInZhcmlhYmxlIHdpdGhcblxuICAgIC8qICBuZXh0VmFyaWFibGVJbmRleCA9IDBcbiAgICAgICAgZm9yIHZhcmlhYmxlIGluIG5hbWVMaXN0OlxuICAgICAgICAgICAgaWYgdmFyaWFibGUgaW4gdGhpcy52YXJOYW1lczpcbiAgICAgICAgICAgICAgICBzd2FwIHZhcmlhYmxlIHdpdGggdmFyaWFibGUgYXQgbmV4dFZhcmlhYmxlSW5kZXhcbiAgICAgICAgICAgICAgICBuZXh0VmFyaWFibGVJbmRleCArPSAxXG4gICAgKi9cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5hbWVMaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciB2YXJOYW1lc19wb3NpdGlvbiA9IHRoaXMudmFyTmFtZXMuaW5kZXhPZihuYW1lTGlzdFtpXSk7XG4gICAgICAgIGlmICh2YXJOYW1lc19wb3NpdGlvbiAhPSAtMSkge1xuICAgICAgICAgICAgLy8gc3dhcCBhbmQgKmFmdGVyd2FyZHMqIGluY3JlYXNlIG5leHRWYXJpYWJsZUluZGV4XG4gICAgICAgICAgICB0aGlzLnZhck5hbWVzLnN3YXAodmFyTmFtZXNfcG9zaXRpb24sIG5leHRWYXJpYWJsZUluZGV4KyspOyB9XG4gICAgfVxufTtcblxuXG4vKlxuIENsYXNzIENvZGVnZW5lcmF0b3JcbiAqL1xuZnVuY3Rpb24gQ29kZUdlbmVyYXRvcihuYW1lc3BhY2UpIHtcbiAgICBpZiAodHlwZW9mIG5hbWVzcGFjZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdGhpcy5uYW1lc3BhY2UgPSBuZXcgTmFtZXNwYWNlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5uYW1lc3BhY2UgPSBuYW1lc3BhY2U7XG4gICAgfVxufVxuXG5Db2RlR2VuZXJhdG9yLnByb3RvdHlwZS5zZXROYW1lc3BhY2UgPSBmdW5jdGlvbihuYW1lc3BhY2UpIHtcbiAgICB0aGlzLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTsgLy8gc3RvcmFnZSBmb3IgdmFyaWFibGUgbmFtZXNcbn07XG5cbkNvZGVHZW5lcmF0b3IucHJvdG90eXBlLmdlbmVyYXRlVmFyaWFibGVTdG9yYWdlQ29kZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjb2RlID0gJ3N0b3JhZ2VbaV0gPSBbXTtcXG4nO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5uYW1lc3BhY2UudmFyTmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIHZhcmlhYmxlID0gdGhpcy5uYW1lc3BhY2UudmFyRGljdFt0aGlzLm5hbWVzcGFjZS52YXJOYW1lc1tpXV07XG4gICAgICAgIGNvZGUgKz0gXCJzdG9yYWdlW2ldLnB1c2goXCIrdmFyaWFibGUrXCIpO1xcblwiO1xuICAgIH1cbiAgICByZXR1cm4gY29kZTtcbn07XG5cbkNvZGVHZW5lcmF0b3IucHJvdG90eXBlLmdlbmVyYXRlU3RhcnRXYWFyZGVuU3RvcmFnZUNvZGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY29kZSA9ICdzdG9yYWdlWzBdID0gW107XFxuJztcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubmFtZXNwYWNlLnZhck5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciB2YXJpYWJsZSA9IHRoaXMubmFtZXNwYWNlLnZhckRpY3RbdGhpcy5uYW1lc3BhY2UudmFyTmFtZXNbaV1dO1xuICAgICAgICBjb2RlICs9IFwiaWYgKHR5cGVvZihcIit2YXJpYWJsZStcIikgPT0gJ3VuZGVmaW5lZCcpIFwiK3ZhcmlhYmxlK1wiPTA7XFxuXCIgK1xuICAgICAgICBcInN0b3JhZ2VbMF0ucHVzaChcIit2YXJpYWJsZStcIik7XFxuXCI7XG4gICAgfVxuICAgIHJldHVybiBjb2RlO1xufTtcblxuXG5Db2RlR2VuZXJhdG9yLnByb3RvdHlwZS5nZW5lcmF0ZUNvZGVGcm9tQXN0ID0gZnVuY3Rpb24oYXN0KSB7XG5cbiAgICB2YXIgY29kZSA9IFwiXCI7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgLy9jb25zb2xlLmxvZyhcIkFTVCBpdGVtID0gXCIsYXN0W2ldKVxuICAgICAgICBjb2RlICs9IHRoaXMucGFyc2VOb2RlKGFzdFtpXSk7XG5cbiAgICB9XG4gICAgcmV0dXJuIGNvZGU7XG59O1xuXG5cblxuXG5Db2RlR2VuZXJhdG9yLnByb3RvdHlwZS5wYXJzZU5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG4gICAgLyogcGFyc2VOb2RlIGlzIGEgcmVjdXJzaXZlIGZ1bmN0aW9uIHRoYXQgcGFyc2VzIGFuIGl0ZW1cbiAgICAgICAgb2YgdGhlIEpTT04gQVNULiBDYWxscyBpdHNlbGYgdG8gdHJhdmVyc2UgdGhyb3VnaCBub2Rlcy5cblxuICAgICAgICA6cGFyYW06IG5vZGUgPSAocGFydCBvZikgSlNPTiB0cmVlXG4gICAgKi9cblxuICAgIC8qIGphdmFzY3JpcHQgY29kZSBnZW5lcmF0aW9uIGluc3BpcmVkIGJ5OlxuICAgICAgICBodHRwOi8vbGlzcGVyYXRvci5uZXQvcGx0dXQvY29tcGlsZXIvanMtY29kZWdlbiAqL1xuXG4gICAgc3dpdGNoKG5vZGUudHlwZSkge1xuXG4gICAgICAgIGNhc2UgJ0Fzc2lnbm1lbnQnOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5hbWVzcGFjZS5jcmVhdGVWYXIobm9kZS5sZWZ0KSArICcgPSAoJyArIHRoaXMucGFyc2VOb2RlKG5vZGUucmlnaHQpICsgJyk7XFxuJztcbiAgICAgICAgY2FzZSAnVmFyaWFibGUnOlxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm5hbWVzcGFjZS5yZWZlcmVuY2VWYXIobm9kZS5uYW1lKTtcbiAgICAgICAgY2FzZSAnQmluYXJ5Jzoge1xuICAgICAgICAgICAgICAgICAgICBpZiAobm9kZS5vcGVyYXRvciA9PSAnXicpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gXCIoTWF0aC5wb3coXCIrdGhpcy5wYXJzZU5vZGUobm9kZS5sZWZ0KStcIixcIit0aGlzLnBhcnNlTm9kZShub2RlLnJpZ2h0KStcIikpXCI7XG4gICAgICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBcIihcIiArIHRoaXMucGFyc2VOb2RlKG5vZGUubGVmdCkgKyBub2RlLm9wZXJhdG9yICsgdGhpcy5wYXJzZU5vZGUobm9kZS5yaWdodCkgKyBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgY2FzZSAnVW5hcnknOlxuICAgICAgICAgICAgICAgICAgICBzd2l0Y2gobm9kZS5vcGVyYXRvcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FzZSAnKyc6ICAgcmV0dXJuIFwiKFwiICsgdGhpcy5wYXJzZU5vZGUobm9kZS5yaWdodCkgKyBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgJy0nOiAgIHJldHVybiBcIigtMS4gKiBcIiArIHRoaXMucGFyc2VOb2RlKG5vZGUucmlnaHQpICsgXCIpXCI7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYXNlICdOT1QnOiAgcmV0dXJuIFwiIShcIisgdGhpcy5wYXJzZU5vZGUobm9kZS5yaWdodCkgKyBcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5rbm93biB1bmFyeTpcIiArIEpTT04uc3RyaW5naWZ5KG5vZGUpKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAvKiBmYWxscyB0aHJvdWdoICovXG4gICAgICAgIGNhc2UgJ0xvZ2ljYWwnOlxuICAgICAgICAgICAgICAgIHJldHVybiBcIihcIiArIHRoaXMucGFyc2VOb2RlKG5vZGUubGVmdCkgKyBub2RlLm9wZXJhdG9yICsgdGhpcy5wYXJzZU5vZGUobm9kZS5yaWdodCkgKyBcIilcIjtcbiAgICAgICAgY2FzZSAnSWYnOlxuICAgICAgICAgICAgICAgIHJldHVybiBcImlmIChcIiArIHRoaXMucGFyc2VOb2RlKG5vZGUuY29uZCkgKyBcIikge1xcblwiICsgdGhpcy5nZW5lcmF0ZUNvZGVGcm9tQXN0KG5vZGUudGhlbikgKyBcIiB9XFxuOyBcIjtcbiAgICAgICAgY2FzZSAnSWZFbHNlJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gXCJpZiAoXCIgKyB0aGlzLnBhcnNlTm9kZShub2RlLmNvbmQpICsgXCIpIHtcXG5cIiArIHRoaXMuZ2VuZXJhdGVDb2RlRnJvbUFzdChub2RlLnRoZW4pICsgXCIgXFxufSBlbHNlIHtcXG5cIiArXG4gICAgICAgICAgICAgICAgdGhpcy5nZW5lcmF0ZUNvZGVGcm9tQXN0KG5vZGUuZWxzZXN0bXQpICsgXCIgfVxcbjsgXCI7XG4gICAgICAgIGNhc2UgJ0Z1bmN0aW9uJzoge1xuICAgICAgICAgICAgICAgIHN3aXRjaChub2RlLmZ1bmMudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzaW4nOiByZXR1cm4gXCJNYXRoLnNpbigoXCIrdGhpcy5wYXJzZU5vZGUobm9kZS5leHByKStcIikvMTgwLipNYXRoLlBJKVwiO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdjb3MnOiByZXR1cm4gXCJNYXRoLmNvcygoXCIrdGhpcy5wYXJzZU5vZGUobm9kZS5leHByKStcIikvMTgwLipNYXRoLlBJKVwiO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICd0YW4nOiByZXR1cm4gXCJNYXRoLnRhbigoXCIrdGhpcy5wYXJzZU5vZGUobm9kZS5leHByKStcIikvMTgwLipNYXRoLlBJKVwiO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdhcmNzaW4nOiByZXR1cm4gXCJNYXRoLmFzaW4oXCIrdGhpcy5wYXJzZU5vZGUobm9kZS5leHByKStcIilcIjtcbiAgICAgICAgICAgICAgICAgICAgY2FzZSAnYXJjY29zJzogcmV0dXJuIFwiTWF0aC5hY29zKFwiK3RoaXMucGFyc2VOb2RlKG5vZGUuZXhwcikrXCIpXCI7XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgJ2FyY3Rhbic6IHJldHVybiBcIk1hdGguYXRhbihcIit0aGlzLnBhcnNlTm9kZShub2RlLmV4cHIpK1wiKVwiO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdleHAnOiByZXR1cm4gXCJNYXRoLmV4cChcIit0aGlzLnBhcnNlTm9kZShub2RlLmV4cHIpK1wiKVwiO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdsbic6ICByZXR1cm4gXCJNYXRoLmxvZyhcIit0aGlzLnBhcnNlTm9kZShub2RlLmV4cHIpK1wiKVwiO1xuICAgICAgICAgICAgICAgICAgICBjYXNlICdzcXJ0JzogcmV0dXJuIFwiTWF0aC5zcXJ0KFwiK3RoaXMucGFyc2VOb2RlKG5vZGUuZXhwcikrXCIpXCI7XG4gICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtvd24gZnVuY3Rpb246XCIgKyBKU09OLnN0cmluZ2lmeShub2RlKSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBhcnNlRmxvYXQobm9kZS52YWx1ZS5yZXBsYWNlKCcsJywnLicpKTtcbiAgICAgICAgY2FzZSAnVHJ1ZSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuICd0cnVlJztcbiAgICAgICAgY2FzZSAnRmFsc2UnOlxuICAgICAgICAgICAgICAgIHJldHVybiAnZmFsc2UnO1xuICAgICAgICBjYXNlICdTdG9wJzpcbiAgICAgICAgICAgICAgICByZXR1cm4gJ3Rocm93IFxcJ1N0b3BJdGVyYXRpb25cXCcnO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5hYmxlIHRvIHBhcnNlTm9kZSgpIDpcIiArIEpTT04uc3RyaW5naWZ5KG5vZGUpKTtcbiAgICB9IC8qIHN3aXRjaCAobm9kZS50eXBlKSAqL1xuXG5cbn07IC8qIGVuZCBvZiBwYXJzZU5vZGUoKSAgKi9cbi8vIGVuZCBvZiBqYXZhc2NyaXB0Q29kZUdlbmVyYXRvcigpXG5cblxuZnVuY3Rpb24gTW9kZWxyZWdlbHNFdmFsdWF0b3IobW9kZWwsIGRlYnVnKSB7XG4gICAgaWYgKHR5cGVvZiBkZWJ1ZyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgdGhpcy5kZWJ1ZyA9IGZhbHNlO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZGVidWcgPSBkZWJ1ZztcbiAgICB9XG5cbiAgICB0aGlzLm5hbWVzcGFjZSA9IG5ldyBOYW1lc3BhY2UoKTtcbiAgICB0aGlzLmNvZGVnZW5lcmF0b3IgPSBuZXcgQ29kZUdlbmVyYXRvcih0aGlzLm5hbWVzcGFjZSk7XG5cbiAgICBpZiAodHlwZW9mIG1vZGVsID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICB0aGlzLm1vZGVsID0gbmV3IG1vZGVsbW9kdWxlLk1vZGVsKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5tb2RlbCA9IG1vZGVsO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcqKiogaW5wdXQgKioqJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKHRoaXMubW9kZWwuc3RhcnR3YWFyZGVuKTtcbiAgICAgICAgY29uc29sZS5sb2codGhpcy5tb2RlbC5tb2RlbHJlZ2Vscyk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGFydHdhYXJkZW5fYXN0ID0gcGFyc2VyLnBhcnNlKHRoaXMubW9kZWwuc3RhcnR3YWFyZGVuKTtcbiAgICB0aGlzLm1vZGVscmVnZWxzX2FzdCA9IHBhcnNlci5wYXJzZSh0aGlzLm1vZGVsLm1vZGVscmVnZWxzKTtcblxuICAgIGlmICh0aGlzLmRlYnVnKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCcqKiogQVNUIHN0YXJ0d2FhcmRlbiAqKionKTtcbiAgICAgICAgY29uc29sZS5sb2coSlNPTi5zdHJpbmdpZnkodGhpcy5zdGFydHdhYXJkZW5fYXN0LCB1bmRlZmluZWQsIDQpKTtcbiAgICAgICAgY29uc29sZS5sb2coJyoqKiBBU1QgbW9kZWxyZWdlbHMgKioqJyk7XG4gICAgICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHRoaXMubW9kZWxyZWdlbHNfYXN0LCB1bmRlZmluZWQsIDQpKTtcbiAgICAgICAgY29uc29sZS5sb2coJycpO1xuICAgIH1cblxufVxuXG5Nb2RlbHJlZ2Vsc0V2YWx1YXRvci5wcm90b3R5cGUucnVuID0gZnVuY3Rpb24oTikge1xuXG4gICAgdmFyIHN0YXJ0d2FhcmRlbl9jb2RlID0gdGhpcy5jb2RlZ2VuZXJhdG9yLmdlbmVyYXRlQ29kZUZyb21Bc3QodGhpcy5zdGFydHdhYXJkZW5fYXN0KTtcbiAgICB0aGlzLm5hbWVzcGFjZS5tb3ZlU3RhcnRXYWFyZGVuKCk7IC8vIGtlZXAgbmFtZXNwYWNlIGNsZWFuXG4gICAgdmFyIG1vZGVscmVnZWxzX2NvZGUgPSB0aGlzLmNvZGVnZW5lcmF0b3IuZ2VuZXJhdGVDb2RlRnJvbUFzdCh0aGlzLm1vZGVscmVnZWxzX2FzdCk7XG4gICAgdGhpcy5uYW1lc3BhY2Uuc29ydFZhck5hbWVzKCk7IC8vIHNvcnQgdmFyaWFibGUgbmFtZXMgZm9yIGJldHRlciBvdXRwdXRcblxuICAgIC8vIHNlcGFyYXRlIGZ1bmN0aW9uIHJ1bl9tb2RlbCgpIGluc2lkZSBhbm9ueW1vdXMgRnVuY3Rpb24oKVxuICAgIC8vIHRvIHByZXZlbnQgYmFpbG91dCBvZiB0aGUgVjggb3B0aW1pc2luZyBjb21waWxlciBpbiB0cnkge30gY2F0Y2hcbiAgICB2YXIgbW9kZWwgPSAgICAgXCJmdW5jdGlvbiBydW5fbW9kZWwoTiwgc3RvcmFnZSkgeyBcXG4gXCIgK1xuICAgICAgICAgICAgICAgICAgICBzdGFydHdhYXJkZW5fY29kZSArIFwiXFxuXCIgK1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmNvZGVnZW5lcmF0b3IuZ2VuZXJhdGVTdGFydFdhYXJkZW5TdG9yYWdlQ29kZSgpICtcbiAgICAgICAgICAgICAgICAgICAgXCIgICAgZm9yICh2YXIgaT0xOyBpIDwgTjsgaSsrKSB7IFxcbiBcIiArXG4gICAgICAgICAgICAgICAgICAgIG1vZGVscmVnZWxzX2NvZGUgKyBcIlxcblwiICtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb2RlZ2VuZXJhdG9yLmdlbmVyYXRlVmFyaWFibGVTdG9yYWdlQ29kZSgpICtcbiAgICAgICAgICAgICAgICAgICAgXCIgICAgfSAgXFxuXCIgK1xuICAgICAgICAgICAgICAgICAgICBcIiByZXR1cm47fSBcXG5cIiArXG4gICAgICAgICAgICAgICAgIFwiICAgIHZhciByZXN1bHRzID0gW107IFxcbiBcIiArXG4gICAgICAgICAgICAgICAgIFwiICAgIHRyeSBcXG5cIiArXG4gICAgICAgICAgICAgICAgIFwiICB7IFxcblwiICtcbiAgICAgICAgICAgICAgICAgXCIgICAgICBydW5fbW9kZWwoTiwgcmVzdWx0cyk7IFxcblwiICtcbiAgICAgICAgICAgICAgICAgXCIgIH0gY2F0Y2ggKGUpIFxcblwiICtcbiAgICAgICAgICAgICAgICAgXCIgIHsgY29uc29sZS5sb2coZSl9IFxcbiBcIiArXG4gICAgICAgICAgICAgICAgIFwicmV0dXJuIHJlc3VsdHM7XFxuXCI7XG5cbiAgICBpZiAodGhpcy5kZWJ1Zykge1xuICAgICAgICBjb25zb2xlLmxvZygnKioqIGdlbmVyYXRlZCBqcyAqKionKTtcbiAgICAgICAgY29uc29sZS5sb2cobW9kZWwpO1xuICAgICAgICBjb25zb2xlLmxvZyhcIioqKiBydW5uaW5nISAqKiogXCIpO1xuICAgICAgICBjb25zb2xlLmxvZyhcIk4gPSBcIiwgTik7XG4gICAgfVxuXG4gICAgdmFyIHQxID0gRGF0ZS5ub3coKTtcblxuICAgIC8vIGV2YWwobW9kZWwpOyAvLyBzbG93Li4uIGluIGNocm9tZSA+MjNcbiAgICAvLyAgdGhlIG9wdGltaXNpbmcgY29tcGlsZXIgZG9lcyBub3Qgb3B0aW1pc2UgZXZhbCgpIGluIGxvY2FsIHNjb3BlXG4gICAgLy8gIGh0dHA6Ly9tb2R1c2NyZWF0ZS5jb20vamF2YXNjcmlwdC1wZXJmb3JtYW5jZS10aXBzLXRyaWNrcy9cbiAgICB2YXIgcnVuTW9kZWwgPSBuZXcgRnVuY3Rpb24oJ04nLCBtb2RlbCk7XG4gICAgdmFyIHJlc3VsdCA9IHJ1bk1vZGVsKE4pO1xuXG4gICAgdmFyIHQyID0gRGF0ZS5ub3coKTtcblxuICAgIGNvbnNvbGUubG9nKFwiTnVtYmVyIG9mIGl0ZXJhdGlvbnM6IFwiLCByZXN1bHQubGVuZ3RoKTtcbiAgICBjb25zb2xlLmxvZyhcIlRpbWU6IFwiICsgKHQyIC0gdDEpICsgXCJtc1wiKTtcblxuICAgIHJldHVybiByZXN1bHQ7XG5cbn07XG5cbmV4cG9ydHMuTW9kZWwgPSBtb2RlbG1vZHVsZS5Nb2RlbDsgLy8gZnJvbSBtb2RlbC5qc1xuZXhwb3J0cy5Nb2RlbHJlZ2Vsc0V2YWx1YXRvciA9IE1vZGVscmVnZWxzRXZhbHVhdG9yO1xuZXhwb3J0cy5Db2RlR2VuZXJhdG9yID0gQ29kZUdlbmVyYXRvcjtcbmV4cG9ydHMuTmFtZXNwYWNlID0gTmFtZXNwYWNlO1xuIiwiLypcclxuIG1vZGVsLmpzXHJcblxyXG4gTW9kZWwgQ2xhc3NcclxuXHJcbiByZWFkIGEgZnJvbSBtb2RlbC54bWxcclxuIHN0b3JlIG1vZGVsIGluIHN0cmluZyBldGNcclxuXHJcblxyXG4gbW9kZWwueG1sIGV4YW1wbGU6XHJcblxyXG4gPG1vZGVsbGVlcnRhYWw+XHJcbiA8c3RhcnR3YWFyZGVuPlxyXG4gICAgIEZtb3RvciA9IDUwMCAnTlxyXG4gICAgIG0gPSA4MDAgJ2tnXHJcbiAgICAgZHQgPSAxZS0yICdzXHJcbiAgICAgdiA9IDAnbS9zXHJcbiAgICAgcyA9IDAgJ20vc1xyXG4gICAgIHQgPSAwICdzXHJcbiA8L3N0YXJ0d2FhcmRlbj5cclxuIDxtb2RlbHJlZ2Vscz5cclxuICAgICBGcmVzPSBGbW90b3JcclxuICAgICBhID0gRnJlcy9tXHJcbiAgICAgZHYgPSBhICogZHRcclxuICAgICB2ID0gdiArIGR2XHJcbiAgICAgZHMgPSB2ICogZHRcclxuICAgICBzID0gcyArIGRzXHJcbiAgICAgdCA9IHQgKyBkdFxyXG4gICAgIGFscyAoMClcclxuICAgICBkYW5cclxuICAgICAgIFN0b3BcclxuICAgICBFaW5kQWxzXHJcbiA8L21vZGVscmVnZWxzPlxyXG5cclxuIDwvbW9kZWxsZWVydGFhbD5cclxuKi9cclxuXHJcblxyXG4vL2pzaGludCBlczM6dHJ1ZVxyXG5cclxudmFyIGZzID0gcmVxdWlyZSgnZnMnKTtcclxuXHJcbmZ1bmN0aW9uIE1vZGVsKCkge1xyXG4gICAgdGhpcy5tb2RlbHJlZ2VscyA9ICcnO1xyXG4gICAgdGhpcy5zdGFydHdhYXJkZW4gPSAnJztcclxufVxyXG5cclxuXHJcbk1vZGVsLnByb3RvdHlwZS5yZWFkQm9ndXNYTUxGaWxlID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcclxuICAgIC8vIFRoaXMgcmVhZCBhIFwiYm9ndXNcIiBYTUwgZmlsZSB0aGF0IHN0aWxsIGluY2x1ZGVzIDwgaW5zdGVhZCBvZiAmbHQ7XHJcbiAgICB2YXIgYnVmID0gZnMucmVhZEZpbGVTeW5jKGZpbGVuYW1lLCBcInV0ZjhcIik7XHJcblxyXG4gICAgdGhpcy5wYXJzZUJvZ3VzWE1MU3RyaW5nKGJ1Zik7XHJcbn07XHJcblxyXG5Nb2RlbC5wcm90b3R5cGUucGFyc2VCb2d1c1hNTFN0cmluZyA9IGZ1bmN0aW9uKHhtbFN0cmluZykge1xyXG5cclxuICAgIHZhciBhY3Rpb24gPSAwOyAvLyAwID0gZG8gbm90aGluZywgMSA9IG1vZGVscmVnZWxzLCAyID0gc3RhcnR3YWFyZGVuXHJcblxyXG4gICAgdGhpcy5zdGFydHdhYXJkZW4gPSAnJztcclxuICAgIHRoaXMubW9kZWxyZWdlbHMgPSAnJztcclxuXHJcbiAgICB2YXIgbGluZXMgPSB4bWxTdHJpbmcuc3BsaXQoJ1xcbicpO1xyXG5cclxuICAgIGZvcih2YXIgbGluZSA9IDE7IGxpbmUgPCBsaW5lcy5sZW5ndGg7IGxpbmUrKykge1xyXG5cclxuICAgICAgICAvL2NvbnNvbGUubG9nKGFjdGlvbiwgbGluZXNbbGluZV0pO1xyXG5cclxuICAgICAgICBzd2l0Y2gobGluZXNbbGluZV0ucmVwbGFjZSgnXFxyJywnJykpIHtcclxuICAgICAgICAgICAgLy8gPCBhbmQgPiBtZXNzIHRoaW5ncyB1cCBpbiB0aGUgYnJvd3NlclxyXG4gICAgICAgICAgICBjYXNlICc8bW9kZWxyZWdlbHM+JzogeyBhY3Rpb24gPSAxOyBjb250aW51ZTsgfVxyXG4gICAgICAgICAgICBjYXNlICc8L21vZGVscmVnZWxzPic6IHsgYWN0aW9uID0gMDsgY29udGludWU7IH1cclxuICAgICAgICAgICAgY2FzZSAnPHN0YXJ0d2FhcmRlbj4nOiB7IGFjdGlvbiA9IDI7IGNvbnRpbnVlOyB9XHJcbiAgICAgICAgICAgIGNhc2UgJzwvc3RhcnR3YWFyZGVuPic6IHsgYWN0aW9uID0gMDsgY29udGludWU7IH1cclxuICAgICAgICB9XHJcbiAgICAgICAgaWYgKGFjdGlvbj09MSkgdGhpcy5tb2RlbHJlZ2VscyArPSBsaW5lc1tsaW5lXSsnXFxuJztcclxuICAgICAgICBpZiAoYWN0aW9uPT0yKSB0aGlzLnN0YXJ0d2FhcmRlbiArPSBsaW5lc1tsaW5lXSsnXFxuJztcclxuICAgIH1cclxuICAgIC8vY29uc29sZS5sb2coJ0RFQlVHOiBpbiBtb2RlbC5qcyBwYXJzZUJvZ3VzWE1MU3RyaW5nIGVuZHJlc3VsdCB0aGlzLm1vZGVscmVnZWxzOicpO1xyXG4gICAgLy9jb25zb2xlLmxvZyh0aGlzLm1vZGVscmVnZWxzKTtcclxuICAgIC8vY29uc29sZS5sb2coJ0RFQlVHOiBpbiBtb2RlbC5qcyBwYXJzZUJvZ3VzWE1MU3RyaW5nIGVuZHJlc3VsdCB0aGlzLnN0YXJ0d2FhcmRlbjonKTtcclxuICAgIC8vY29uc29sZS5sb2codGhpcy5zdGFydHdhYXJkZW4pO1xyXG5cclxufTtcclxuXHJcbk1vZGVsLnByb3RvdHlwZS5jcmVhdGVCb2d1c1hNTFN0cmluZyA9IGZ1bmN0aW9uKCkge1xyXG5cclxuICAgIHJldHVybiAnPG1vZGVsbGVlcnRhYWw+XFxuPHN0YXJ0d2FhcmRlbj5cXG4nICtcclxuICAgICAgICAgICAgdGhpcy5zdGFydHdhYXJkZW4gK1xyXG4gICAgICAgICAgICAnPC9zdGFydHdhYXJkZW4+XFxuPG1vZGVscmVnZWxzPlxcbicgK1xyXG4gICAgICAgICAgICB0aGlzLm1vZGVscmVnZWxzICtcclxuICAgICAgICAgICAgJzwvbW9kZWxyZWdlbHM+XFxuPC9tb2RlbGxlZXJ0YWFsPlxcbic7XHJcbn07XHJcblxyXG5cclxuXHJcbmV4cG9ydHMuTW9kZWwgPSBNb2RlbDtcclxuIiwiLyogcGFyc2VyIGdlbmVyYXRlZCBieSBqaXNvbiAwLjQuMTggKi9cbi8qXG4gIFJldHVybnMgYSBQYXJzZXIgb2JqZWN0IG9mIHRoZSBmb2xsb3dpbmcgc3RydWN0dXJlOlxuXG4gIFBhcnNlcjoge1xuICAgIHl5OiB7fVxuICB9XG5cbiAgUGFyc2VyLnByb3RvdHlwZToge1xuICAgIHl5OiB7fSxcbiAgICB0cmFjZTogZnVuY3Rpb24oKSxcbiAgICBzeW1ib2xzXzoge2Fzc29jaWF0aXZlIGxpc3Q6IG5hbWUgPT0+IG51bWJlcn0sXG4gICAgdGVybWluYWxzXzoge2Fzc29jaWF0aXZlIGxpc3Q6IG51bWJlciA9PT4gbmFtZX0sXG4gICAgcHJvZHVjdGlvbnNfOiBbLi4uXSxcbiAgICBwZXJmb3JtQWN0aW9uOiBmdW5jdGlvbiBhbm9ueW1vdXMoeXl0ZXh0LCB5eWxlbmcsIHl5bGluZW5vLCB5eSwgeXlzdGF0ZSwgJCQsIF8kKSxcbiAgICB0YWJsZTogWy4uLl0sXG4gICAgZGVmYXVsdEFjdGlvbnM6IHsuLi59LFxuICAgIHBhcnNlRXJyb3I6IGZ1bmN0aW9uKHN0ciwgaGFzaCksXG4gICAgcGFyc2U6IGZ1bmN0aW9uKGlucHV0KSxcblxuICAgIGxleGVyOiB7XG4gICAgICAgIEVPRjogMSxcbiAgICAgICAgcGFyc2VFcnJvcjogZnVuY3Rpb24oc3RyLCBoYXNoKSxcbiAgICAgICAgc2V0SW5wdXQ6IGZ1bmN0aW9uKGlucHV0KSxcbiAgICAgICAgaW5wdXQ6IGZ1bmN0aW9uKCksXG4gICAgICAgIHVucHV0OiBmdW5jdGlvbihzdHIpLFxuICAgICAgICBtb3JlOiBmdW5jdGlvbigpLFxuICAgICAgICBsZXNzOiBmdW5jdGlvbihuKSxcbiAgICAgICAgcGFzdElucHV0OiBmdW5jdGlvbigpLFxuICAgICAgICB1cGNvbWluZ0lucHV0OiBmdW5jdGlvbigpLFxuICAgICAgICBzaG93UG9zaXRpb246IGZ1bmN0aW9uKCksXG4gICAgICAgIHRlc3RfbWF0Y2g6IGZ1bmN0aW9uKHJlZ2V4X21hdGNoX2FycmF5LCBydWxlX2luZGV4KSxcbiAgICAgICAgbmV4dDogZnVuY3Rpb24oKSxcbiAgICAgICAgbGV4OiBmdW5jdGlvbigpLFxuICAgICAgICBiZWdpbjogZnVuY3Rpb24oY29uZGl0aW9uKSxcbiAgICAgICAgcG9wU3RhdGU6IGZ1bmN0aW9uKCksXG4gICAgICAgIF9jdXJyZW50UnVsZXM6IGZ1bmN0aW9uKCksXG4gICAgICAgIHRvcFN0YXRlOiBmdW5jdGlvbigpLFxuICAgICAgICBwdXNoU3RhdGU6IGZ1bmN0aW9uKGNvbmRpdGlvbiksXG5cbiAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgcmFuZ2VzOiBib29sZWFuICAgICAgICAgICAob3B0aW9uYWw6IHRydWUgPT0+IHRva2VuIGxvY2F0aW9uIGluZm8gd2lsbCBpbmNsdWRlIGEgLnJhbmdlW10gbWVtYmVyKVxuICAgICAgICAgICAgZmxleDogYm9vbGVhbiAgICAgICAgICAgICAob3B0aW9uYWw6IHRydWUgPT0+IGZsZXgtbGlrZSBsZXhpbmcgYmVoYXZpb3VyIHdoZXJlIHRoZSBydWxlcyBhcmUgdGVzdGVkIGV4aGF1c3RpdmVseSB0byBmaW5kIHRoZSBsb25nZXN0IG1hdGNoKVxuICAgICAgICAgICAgYmFja3RyYWNrX2xleGVyOiBib29sZWFuICAob3B0aW9uYWw6IHRydWUgPT0+IGxleGVyIHJlZ2V4ZXMgYXJlIHRlc3RlZCBpbiBvcmRlciBhbmQgZm9yIGVhY2ggbWF0Y2hpbmcgcmVnZXggdGhlIGFjdGlvbiBjb2RlIGlzIGludm9rZWQ7IHRoZSBsZXhlciB0ZXJtaW5hdGVzIHRoZSBzY2FuIHdoZW4gYSB0b2tlbiBpcyByZXR1cm5lZCBieSB0aGUgYWN0aW9uIGNvZGUpXG4gICAgICAgIH0sXG5cbiAgICAgICAgcGVyZm9ybUFjdGlvbjogZnVuY3Rpb24oeXksIHl5XywgJGF2b2lkaW5nX25hbWVfY29sbGlzaW9ucywgWVlfU1RBUlQpLFxuICAgICAgICBydWxlczogWy4uLl0sXG4gICAgICAgIGNvbmRpdGlvbnM6IHthc3NvY2lhdGl2ZSBsaXN0OiBuYW1lID09PiBzZXR9LFxuICAgIH1cbiAgfVxuXG5cbiAgdG9rZW4gbG9jYXRpb24gaW5mbyAoQCQsIF8kLCBldGMuKToge1xuICAgIGZpcnN0X2xpbmU6IG4sXG4gICAgbGFzdF9saW5lOiBuLFxuICAgIGZpcnN0X2NvbHVtbjogbixcbiAgICBsYXN0X2NvbHVtbjogbixcbiAgICByYW5nZTogW3N0YXJ0X251bWJlciwgZW5kX251bWJlcl0gICAgICAgKHdoZXJlIHRoZSBudW1iZXJzIGFyZSBpbmRleGVzIGludG8gdGhlIGlucHV0IHN0cmluZywgcmVndWxhciB6ZXJvLWJhc2VkKVxuICB9XG5cblxuICB0aGUgcGFyc2VFcnJvciBmdW5jdGlvbiByZWNlaXZlcyBhICdoYXNoJyBvYmplY3Qgd2l0aCB0aGVzZSBtZW1iZXJzIGZvciBsZXhlciBhbmQgcGFyc2VyIGVycm9yczoge1xuICAgIHRleHQ6ICAgICAgICAobWF0Y2hlZCB0ZXh0KVxuICAgIHRva2VuOiAgICAgICAodGhlIHByb2R1Y2VkIHRlcm1pbmFsIHRva2VuLCBpZiBhbnkpXG4gICAgbGluZTogICAgICAgICh5eWxpbmVubylcbiAgfVxuICB3aGlsZSBwYXJzZXIgKGdyYW1tYXIpIGVycm9ycyB3aWxsIGFsc28gcHJvdmlkZSB0aGVzZSBtZW1iZXJzLCBpLmUuIHBhcnNlciBlcnJvcnMgZGVsaXZlciBhIHN1cGVyc2V0IG9mIGF0dHJpYnV0ZXM6IHtcbiAgICBsb2M6ICAgICAgICAgKHl5bGxvYylcbiAgICBleHBlY3RlZDogICAgKHN0cmluZyBkZXNjcmliaW5nIHRoZSBzZXQgb2YgZXhwZWN0ZWQgdG9rZW5zKVxuICAgIHJlY292ZXJhYmxlOiAoYm9vbGVhbjogVFJVRSB3aGVuIHRoZSBwYXJzZXIgaGFzIGEgZXJyb3IgcmVjb3ZlcnkgcnVsZSBhdmFpbGFibGUgZm9yIHRoaXMgcGFydGljdWxhciBlcnJvcilcbiAgfVxuKi9cbnZhciBwYXJzZXIgPSAoZnVuY3Rpb24oKXtcbnZhciBvPWZ1bmN0aW9uKGssdixvLGwpe2ZvcihvPW98fHt9LGw9ay5sZW5ndGg7bC0tO29ba1tsXV09dik7cmV0dXJuIG99LCRWMD1bMSw0XSwkVjE9WzEsNV0sJFYyPVsxLDZdLCRWMz1bNSw3LDEwLDEzLDE0LDE1XSwkVjQ9WzEsMjFdLCRWNT1bMSwxNl0sJFY2PVsxLDE0XSwkVjc9WzEsMTNdLCRWOD1bMSwxNV0sJFY5PVsxLDE3XSwkVmE9WzEsMThdLCRWYj1bMSwxOV0sJFZjPVsxLDIwXSwkVmQ9WzEsMjRdLCRWZT1bMSwyNV0sJFZmPVsxLDI2XSwkVmc9WzEsMjddLCRWaD1bMSwyOF0sJFZpPVsxLDI5XSwkVmo9WzEsMzBdLCRWaz1bMSwzMV0sJFZsPVsxLDMyXSwkVm09WzEsMzNdLCRWbj1bNSw3LDEwLDEyLDEzLDE0LDE1LDE4LDE5LDIwLDIxLDIyLDIzLDI0LDI1LDI2LDI3LDI4XSwkVm89WzUsNywxMCwxMiwxMywxNCwxNSwxOCwyNSwyNl0sJFZwPVs1LDcsMTAsMTIsMTMsMTQsMTUsMTgsMjQsMjUsMjYsMjcsMjhdLCRWcT1bNSw3LDEwLDEyLDEzLDE0LDE1LDE4LDI1LDI2LDI3LDI4XTtcbnZhciBwYXJzZXIgPSB7dHJhY2U6IGZ1bmN0aW9uIHRyYWNlKCkgeyB9LFxueXk6IHt9LFxuc3ltYm9sc186IHtcImVycm9yXCI6MixcInByb2dyYW1cIjozLFwic3RtdF9saXN0XCI6NCxcIkVPRlwiOjUsXCJzdG10XCI6NixcIklERU5UXCI6NyxcIkFTU0lHTlwiOjgsXCJleHByXCI6OSxcIklGXCI6MTAsXCJjb25kaXRpb25cIjoxMSxcIlRIRU5cIjoxMixcIkVORElGXCI6MTMsXCJFTFNFXCI6MTQsXCJTVE9QXCI6MTUsXCJkaXJlY3RfZGVjbGFyYXRvclwiOjE2LFwiKFwiOjE3LFwiKVwiOjE4LFwiPT1cIjoxOSxcIj5cIjoyMCxcIj49XCI6MjEsXCI8XCI6MjIsXCI8PVwiOjIzLFwiXlwiOjI0LFwiK1wiOjI1LFwiLVwiOjI2LFwiKlwiOjI3LFwiL1wiOjI4LFwiTk9UXCI6MjksXCJOVU1CRVJcIjozMCxcIlBJXCI6MzEsXCJUUlVFXCI6MzIsXCJGQUxTRVwiOjMzLFwiJGFjY2VwdFwiOjAsXCIkZW5kXCI6MX0sXG50ZXJtaW5hbHNfOiB7MjpcImVycm9yXCIsNTpcIkVPRlwiLDc6XCJJREVOVFwiLDg6XCJBU1NJR05cIiwxMDpcIklGXCIsMTI6XCJUSEVOXCIsMTM6XCJFTkRJRlwiLDE0OlwiRUxTRVwiLDE1OlwiU1RPUFwiLDE3OlwiKFwiLDE4OlwiKVwiLDE5OlwiPT1cIiwyMDpcIj5cIiwyMTpcIj49XCIsMjI6XCI8XCIsMjM6XCI8PVwiLDI0OlwiXlwiLDI1OlwiK1wiLDI2OlwiLVwiLDI3OlwiKlwiLDI4OlwiL1wiLDI5OlwiTk9UXCIsMzA6XCJOVU1CRVJcIiwzMTpcIlBJXCIsMzI6XCJUUlVFXCIsMzM6XCJGQUxTRVwifSxcbnByb2R1Y3Rpb25zXzogWzAsWzMsMl0sWzQsMV0sWzQsMl0sWzYsM10sWzYsNV0sWzYsN10sWzYsMV0sWzExLDFdLFsxNiwxXSxbMTYsNF0sWzksMV0sWzksM10sWzksM10sWzksM10sWzksM10sWzksM10sWzksM10sWzksM10sWzksM10sWzksM10sWzksM10sWzksMl0sWzksMl0sWzksMl0sWzksM10sWzksMV0sWzksMV0sWzksMV0sWzksMV1dLFxucGVyZm9ybUFjdGlvbjogZnVuY3Rpb24gYW5vbnltb3VzKHl5dGV4dCwgeXlsZW5nLCB5eWxpbmVubywgeXksIHl5c3RhdGUgLyogYWN0aW9uWzFdICovLCAkJCAvKiB2c3RhY2sgKi8sIF8kIC8qIGxzdGFjayAqLykge1xuLyogdGhpcyA9PSB5eXZhbCAqL1xuXG52YXIgJDAgPSAkJC5sZW5ndGggLSAxO1xuc3dpdGNoICh5eXN0YXRlKSB7XG5jYXNlIDE6XG4gcmV0dXJuKCQkWyQwLTFdKTsgXG5icmVhaztcbmNhc2UgMjpcbiB0aGlzLiQgPSBbJCRbJDBdXTsgXG5icmVhaztcbmNhc2UgMzpcbiAkJFskMC0xXS5wdXNoKCQkWyQwXSk7IHRoaXMuJCA9ICQkWyQwLTFdOyBcbmJyZWFrO1xuY2FzZSA0OlxuIHRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnQXNzaWdubWVudCcsXG4gICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICAgcmlnaHQ6ICQkWyQwXVxuXG4gICAgICAgICAgICB9O1xuICAgICAgICBcbmJyZWFrO1xuY2FzZSA1OlxuIHRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnSWYnLFxuICAgICAgICAgICAgICAgIGNvbmQ6ICQkWyQwLTNdLFxuICAgICAgICAgICAgICAgIHRoZW46ICQkWyQwLTFdXG4gICAgICAgICAgICB9O1xuICAgICAgICBcbmJyZWFrO1xuY2FzZSA2OlxuIHRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgdHlwZTogJ0lmRWxzZScsXG4gICAgICAgICAgICAgIGNvbmQ6ICQkWyQwLTVdLFxuICAgICAgICAgICAgICB0aGVuOiAkJFskMC0zXSxcbiAgICAgICAgICAgICAgZWxzZXN0bXQ6ICQkWyQwLTFdXG4gICAgICAgICAgfTtcbiAgICAgIFxuYnJlYWs7XG5jYXNlIDc6XG50aGlzLiQgPSB7XG4gICAgICAgICAgICAgICAgIHR5cGU6ICdTdG9wJyxcbiAgICAgICAgICAgICAgICAgdmFsdWU6ICQkWyQwXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgXG5icmVhaztcbmNhc2UgODogY2FzZSAxMTpcbnRoaXMuJCA9ICQkWyQwXTtcbmJyZWFrO1xuY2FzZSA5OlxuIHRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdWYXJpYWJsZScsXG4gICAgICAgICAgICAgICAgICBuYW1lOiB5eXRleHRcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICBcbmJyZWFrO1xuY2FzZSAxMDpcbnRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgdHlwZTogJ0Z1bmN0aW9uJyxcbiAgICAgICAgICAgICAgZnVuYzogJCRbJDAtM10sXG4gICAgICAgICAgICAgIGV4cHI6ICQkWyQwLTFdXG4gICAgICB9O1xuICBcbmJyZWFrO1xuY2FzZSAxMjpcbnRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgIHR5cGU6ICdMb2dpY2FsJyxcbiAgICAgICAgICAgICAgIG9wZXJhdG9yOiAnPT0nLFxuICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICByaWdodDogJCRbJDBdXG4gICAgICAgfTtcbiAgIFxuYnJlYWs7XG5jYXNlIDEzOlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICB0eXBlOiAnTG9naWNhbCcsXG4gICAgICAgICAgICAgIG9wZXJhdG9yOiAnPicsXG4gICAgICAgICAgICAgIGxlZnQ6ICQkWyQwLTJdLFxuICAgICAgICAgICAgICByaWdodDogJCRbJDBdXG4gICAgICB9O1xuICBcbmJyZWFrO1xuY2FzZSAxNDpcbnRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnTG9naWNhbCcsXG4gICAgICAgICAgICAgICAgb3BlcmF0b3I6ICc+PScsXG4gICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICAgcmlnaHQ6ICQkWyQwXVxuICAgICAgICB9O1xuICAgIFxuYnJlYWs7XG5jYXNlIDE1OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgdHlwZTogJ0xvZ2ljYWwnLFxuICAgICAgICAgICAgICAgb3BlcmF0b3I6ICc8JyxcbiAgICAgICAgICAgICAgIGxlZnQ6ICQkWyQwLTJdLFxuICAgICAgICAgICAgICAgcmlnaHQ6ICQkWyQwXVxuICAgICAgIH07XG4gICBcbmJyZWFrO1xuY2FzZSAxNjpcbnRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgICAgIHR5cGU6ICdMb2dpY2FsJyxcbiAgICAgICAgICAgICAgICAgIG9wZXJhdG9yOiAnPD0nLFxuICAgICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICAgICByaWdodDogJCRbJDBdXG4gICAgICAgICAgfTtcbiAgICAgIFxuYnJlYWs7XG5jYXNlIDE3OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgICB0eXBlOiAnQmluYXJ5JyxcbiAgICAgICAgICAgICAgICAgb3BlcmF0b3I6ICdeJyxcbiAgICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICAgIHJpZ2h0OiAkJFskMF1cbiAgICAgICAgICAgfTtcbiAgICAgICAgIFxuYnJlYWs7XG5jYXNlIDE4OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdCaW5hcnknLFxuICAgICAgICAgICAgICAgIG9wZXJhdG9yOiAnKycsXG4gICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICAgcmlnaHQ6ICQkWyQwXVxuICAgICAgICAgIH07XG4gICAgICAgIFxuYnJlYWs7XG5jYXNlIDE5OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgICB0eXBlOiAnQmluYXJ5JyxcbiAgICAgICAgICAgICAgICAgb3BlcmF0b3I6ICctJyxcbiAgICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICAgIHJpZ2h0OiAkJFskMF1cbiAgICAgICAgICAgfTtcbiAgICAgICAgIFxuYnJlYWs7XG5jYXNlIDIwOlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgICB0eXBlOiAnQmluYXJ5JyxcbiAgICAgICAgICAgICAgICAgb3BlcmF0b3I6ICcqJyxcbiAgICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICAgIHJpZ2h0OiAkJFskMF1cbiAgICAgICAgICAgfTtcbiAgICAgICAgIFxuYnJlYWs7XG5jYXNlIDIxOlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgdHlwZTogJ0JpbmFyeScsXG4gICAgICAgICAgICAgICBvcGVyYXRvcjogJy8nLFxuICAgICAgICAgICAgICAgbGVmdDogJCRbJDAtMl0sXG4gICAgICAgICAgICAgICByaWdodDogJCRbJDBdXG4gICAgICAgICB9O1xuICAgICAgIFxuYnJlYWs7XG5jYXNlIDIyOlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ1VuYXJ5JyxcbiAgICAgICAgICAgICAgICAgIG9wZXJhdG9yOiAnLScsXG4gICAgICAgICAgICAgICAgICByaWdodDogJCRbJDBdXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIFxuYnJlYWs7XG5jYXNlIDIzOlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ1VuYXJ5JyxcbiAgICAgICAgICAgICAgICAgIG9wZXJhdG9yOiAnKycsXG4gICAgICAgICAgICAgICAgICByaWdodDogJCRbJDBdXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIFxuYnJlYWs7XG5jYXNlIDI0OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdVbmFyeScsXG4gICAgICAgICAgICAgICAgb3BlcmF0b3I6ICdOT1QnLFxuICAgICAgICAgICAgICAgIHJpZ2h0OiAkJFskMF1cbiAgICAgICAgICB9O1xuICAgICAgICBcbmJyZWFrO1xuY2FzZSAyNTpcbnRoaXMuJCA9ICQkWyQwLTFdO1xuYnJlYWs7XG5jYXNlIDI2OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgICAgdHlwZTogJ051bWJlcicsXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogJCRbJDBdXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgIFxuYnJlYWs7XG5jYXNlIDI3OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICB0eXBlOiAnTnVtYmVyJyxcbiAgICAgICAgICAgICAgdmFsdWU6IFwiMy4xNDE1OTI2NTM1OVwiXG4gICAgICAgICAgfTtcbiAgICAgICBcbmJyZWFrO1xuY2FzZSAyODpcbnRoaXMuJCA9IHtcbiAgICAgICAgICAgICAgICB0eXBlOiAnVHJ1ZScsXG4gICAgICAgICAgICAgICAgdmFsdWU6ICQkWyQwXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgIFxuYnJlYWs7XG5jYXNlIDI5OlxudGhpcy4kID0ge1xuICAgICAgICAgICAgICAgIHR5cGU6ICdGYWxzZScsXG4gICAgICAgICAgICAgICAgdmFsdWU6ICQkWyQwXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgIFxuYnJlYWs7XG59XG59LFxudGFibGU6IFt7MzoxLDQ6Miw2OjMsNzokVjAsMTA6JFYxLDE1OiRWMn0sezE6WzNdfSx7NTpbMSw3XSw2OjgsNzokVjAsMTA6JFYxLDE1OiRWMn0sbygkVjMsWzIsMl0pLHs4OlsxLDldfSx7NzokVjQsOToxMSwxMToxMCwxNjoxMiwxNzokVjUsMjU6JFY2LDI2OiRWNywyOTokVjgsMzA6JFY5LDMxOiRWYSwzMjokVmIsMzM6JFZjfSxvKCRWMyxbMiw3XSksezE6WzIsMV19LG8oJFYzLFsyLDNdKSx7NzokVjQsOToyMiwxNjoxMiwxNzokVjUsMjU6JFY2LDI2OiRWNywyOTokVjgsMzA6JFY5LDMxOiRWYSwzMjokVmIsMzM6JFZjfSx7MTI6WzEsMjNdfSx7MTI6WzIsOF0sMTk6JFZkLDIwOiRWZSwyMTokVmYsMjI6JFZnLDIzOiRWaCwyNDokVmksMjU6JFZqLDI2OiRWaywyNzokVmwsMjg6JFZtfSxvKCRWbixbMiwxMV0pLHs3OiRWNCw5OjM0LDE2OjEyLDE3OiRWNSwyNTokVjYsMjY6JFY3LDI5OiRWOCwzMDokVjksMzE6JFZhLDMyOiRWYiwzMzokVmN9LHs3OiRWNCw5OjM1LDE2OjEyLDE3OiRWNSwyNTokVjYsMjY6JFY3LDI5OiRWOCwzMDokVjksMzE6JFZhLDMyOiRWYiwzMzokVmN9LHs3OiRWNCw5OjM2LDE2OjEyLDE3OiRWNSwyNTokVjYsMjY6JFY3LDI5OiRWOCwzMDokVjksMzE6JFZhLDMyOiRWYiwzMzokVmN9LHs3OiRWNCw5OjM3LDE2OjEyLDE3OiRWNSwyNTokVjYsMjY6JFY3LDI5OiRWOCwzMDokVjksMzE6JFZhLDMyOiRWYiwzMzokVmN9LG8oJFZuLFsyLDI2XSksbygkVm4sWzIsMjddKSxvKCRWbixbMiwyOF0pLG8oJFZuLFsyLDI5XSksbygkVm4sWzIsOV0sezE3OlsxLDM4XX0pLG8oJFYzLFsyLDRdLHsxOTokVmQsMjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZoLDI0OiRWaSwyNTokVmosMjY6JFZrLDI3OiRWbCwyODokVm19KSx7NDozOSw2OjMsNzokVjAsMTA6JFYxLDE1OiRWMn0sezc6JFY0LDk6NDAsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDEsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDIsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDMsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDQsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDUsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDYsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDcsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDgsMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sezc6JFY0LDk6NDksMTY6MTIsMTc6JFY1LDI1OiRWNiwyNjokVjcsMjk6JFY4LDMwOiRWOSwzMTokVmEsMzI6JFZiLDMzOiRWY30sbygkVm8sWzIsMjJdLHsxOTokVmQsMjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZoLDI0OiRWaSwyNzokVmwsMjg6JFZtfSksbygkVm8sWzIsMjNdLHsxOTokVmQsMjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZoLDI0OiRWaSwyNzokVmwsMjg6JFZtfSksbygkVnAsWzIsMjRdLHsxOTokVmQsMjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZofSksezE4OlsxLDUwXSwxOTokVmQsMjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZoLDI0OiRWaSwyNTokVmosMjY6JFZrLDI3OiRWbCwyODokVm19LHs3OiRWNCw5OjUxLDE2OjEyLDE3OiRWNSwyNTokVjYsMjY6JFY3LDI5OiRWOCwzMDokVjksMzE6JFZhLDMyOiRWYiwzMzokVmN9LHs2OjgsNzokVjAsMTA6JFYxLDEzOlsxLDUyXSwxNDpbMSw1M10sMTU6JFYyfSxvKFs1LDcsMTAsMTIsMTMsMTQsMTUsMTgsMTksMjQsMjUsMjYsMjcsMjhdLFsyLDEyXSx7MjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZofSksbygkVm4sWzIsMTNdKSxvKFs1LDcsMTAsMTIsMTMsMTQsMTUsMTgsMTksMjEsMjIsMjMsMjQsMjUsMjYsMjcsMjhdLFsyLDE0XSx7MjA6JFZlfSksbyhbNSw3LDEwLDEyLDEzLDE0LDE1LDE4LDE5LDIyLDIzLDI0LDI1LDI2LDI3LDI4XSxbMiwxNV0sezIwOiRWZSwyMTokVmZ9KSxvKFs1LDcsMTAsMTIsMTMsMTQsMTUsMTgsMTksMjMsMjQsMjUsMjYsMjcsMjhdLFsyLDE2XSx7MjA6JFZlLDIxOiRWZiwyMjokVmd9KSxvKCRWcCxbMiwxN10sezE5OiRWZCwyMDokVmUsMjE6JFZmLDIyOiRWZywyMzokVmh9KSxvKCRWbyxbMiwxOF0sezE5OiRWZCwyMDokVmUsMjE6JFZmLDIyOiRWZywyMzokVmgsMjQ6JFZpLDI3OiRWbCwyODokVm19KSxvKCRWbyxbMiwxOV0sezE5OiRWZCwyMDokVmUsMjE6JFZmLDIyOiRWZywyMzokVmgsMjQ6JFZpLDI3OiRWbCwyODokVm19KSxvKCRWcSxbMiwyMF0sezE5OiRWZCwyMDokVmUsMjE6JFZmLDIyOiRWZywyMzokVmgsMjQ6JFZpfSksbygkVnEsWzIsMjFdLHsxOTokVmQsMjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZoLDI0OiRWaX0pLG8oJFZuLFsyLDI1XSksezE4OlsxLDU0XSwxOTokVmQsMjA6JFZlLDIxOiRWZiwyMjokVmcsMjM6JFZoLDI0OiRWaSwyNTokVmosMjY6JFZrLDI3OiRWbCwyODokVm19LG8oJFYzLFsyLDVdKSx7NDo1NSw2OjMsNzokVjAsMTA6JFYxLDE1OiRWMn0sbygkVm4sWzIsMTBdKSx7Njo4LDc6JFYwLDEwOiRWMSwxMzpbMSw1Nl0sMTU6JFYyfSxvKCRWMyxbMiw2XSldLFxuZGVmYXVsdEFjdGlvbnM6IHs3OlsyLDFdfSxcbnBhcnNlRXJyb3I6IGZ1bmN0aW9uIHBhcnNlRXJyb3Ioc3RyLCBoYXNoKSB7XG4gICAgaWYgKGhhc2gucmVjb3ZlcmFibGUpIHtcbiAgICAgICAgdGhpcy50cmFjZShzdHIpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvcihzdHIpO1xuICAgICAgICBlcnJvci5oYXNoID0gaGFzaDtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxufSxcbnBhcnNlOiBmdW5jdGlvbiBwYXJzZShpbnB1dCkge1xuICAgIHZhciBzZWxmID0gdGhpcywgc3RhY2sgPSBbMF0sIHRzdGFjayA9IFtdLCB2c3RhY2sgPSBbbnVsbF0sIGxzdGFjayA9IFtdLCB0YWJsZSA9IHRoaXMudGFibGUsIHl5dGV4dCA9ICcnLCB5eWxpbmVubyA9IDAsIHl5bGVuZyA9IDAsIHJlY292ZXJpbmcgPSAwLCBURVJST1IgPSAyLCBFT0YgPSAxO1xuICAgIHZhciBhcmdzID0gbHN0YWNrLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICB2YXIgbGV4ZXIgPSBPYmplY3QuY3JlYXRlKHRoaXMubGV4ZXIpO1xuICAgIHZhciBzaGFyZWRTdGF0ZSA9IHsgeXk6IHt9IH07XG4gICAgZm9yICh2YXIgayBpbiB0aGlzLnl5KSB7XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy55eSwgaykpIHtcbiAgICAgICAgICAgIHNoYXJlZFN0YXRlLnl5W2tdID0gdGhpcy55eVtrXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBsZXhlci5zZXRJbnB1dChpbnB1dCwgc2hhcmVkU3RhdGUueXkpO1xuICAgIHNoYXJlZFN0YXRlLnl5LmxleGVyID0gbGV4ZXI7XG4gICAgc2hhcmVkU3RhdGUueXkucGFyc2VyID0gdGhpcztcbiAgICBpZiAodHlwZW9mIGxleGVyLnl5bGxvYyA9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBsZXhlci55eWxsb2MgPSB7fTtcbiAgICB9XG4gICAgdmFyIHl5bG9jID0gbGV4ZXIueXlsbG9jO1xuICAgIGxzdGFjay5wdXNoKHl5bG9jKTtcbiAgICB2YXIgcmFuZ2VzID0gbGV4ZXIub3B0aW9ucyAmJiBsZXhlci5vcHRpb25zLnJhbmdlcztcbiAgICBpZiAodHlwZW9mIHNoYXJlZFN0YXRlLnl5LnBhcnNlRXJyb3IgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5wYXJzZUVycm9yID0gc2hhcmVkU3RhdGUueXkucGFyc2VFcnJvcjtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnBhcnNlRXJyb3IgPSBPYmplY3QuZ2V0UHJvdG90eXBlT2YodGhpcykucGFyc2VFcnJvcjtcbiAgICB9XG4gICAgZnVuY3Rpb24gcG9wU3RhY2sobikge1xuICAgICAgICBzdGFjay5sZW5ndGggPSBzdGFjay5sZW5ndGggLSAyICogbjtcbiAgICAgICAgdnN0YWNrLmxlbmd0aCA9IHZzdGFjay5sZW5ndGggLSBuO1xuICAgICAgICBsc3RhY2subGVuZ3RoID0gbHN0YWNrLmxlbmd0aCAtIG47XG4gICAgfVxuICAgIF90b2tlbl9zdGFjazpcbiAgICAgICAgdmFyIGxleCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB0b2tlbjtcbiAgICAgICAgICAgIHRva2VuID0gbGV4ZXIubGV4KCkgfHwgRU9GO1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB0b2tlbiAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgICB0b2tlbiA9IHNlbGYuc3ltYm9sc19bdG9rZW5dIHx8IHRva2VuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRva2VuO1xuICAgICAgICB9O1xuICAgIHZhciBzeW1ib2wsIHByZUVycm9yU3ltYm9sLCBzdGF0ZSwgYWN0aW9uLCBhLCByLCB5eXZhbCA9IHt9LCBwLCBsZW4sIG5ld1N0YXRlLCBleHBlY3RlZDtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBzdGF0ZSA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAodGhpcy5kZWZhdWx0QWN0aW9uc1tzdGF0ZV0pIHtcbiAgICAgICAgICAgIGFjdGlvbiA9IHRoaXMuZGVmYXVsdEFjdGlvbnNbc3RhdGVdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHN5bWJvbCA9PT0gbnVsbCB8fCB0eXBlb2Ygc3ltYm9sID09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgc3ltYm9sID0gbGV4KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhY3Rpb24gPSB0YWJsZVtzdGF0ZV0gJiYgdGFibGVbc3RhdGVdW3N5bWJvbF07XG4gICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBhY3Rpb24gPT09ICd1bmRlZmluZWQnIHx8ICFhY3Rpb24ubGVuZ3RoIHx8ICFhY3Rpb25bMF0pIHtcbiAgICAgICAgICAgICAgICB2YXIgZXJyU3RyID0gJyc7XG4gICAgICAgICAgICAgICAgZXhwZWN0ZWQgPSBbXTtcbiAgICAgICAgICAgICAgICBmb3IgKHAgaW4gdGFibGVbc3RhdGVdKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnRlcm1pbmFsc19bcF0gJiYgcCA+IFRFUlJPUikge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWQucHVzaCgnXFwnJyArIHRoaXMudGVybWluYWxzX1twXSArICdcXCcnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobGV4ZXIuc2hvd1Bvc2l0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgIGVyclN0ciA9ICdQYXJzZSBlcnJvciBvbiBsaW5lICcgKyAoeXlsaW5lbm8gKyAxKSArICc6XFxuJyArIGxleGVyLnNob3dQb3NpdGlvbigpICsgJ1xcbkV4cGVjdGluZyAnICsgZXhwZWN0ZWQuam9pbignLCAnKSArICcsIGdvdCBcXCcnICsgKHRoaXMudGVybWluYWxzX1tzeW1ib2xdIHx8IHN5bWJvbCkgKyAnXFwnJztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlcnJTdHIgPSAnUGFyc2UgZXJyb3Igb24gbGluZSAnICsgKHl5bGluZW5vICsgMSkgKyAnOiBVbmV4cGVjdGVkICcgKyAoc3ltYm9sID09IEVPRiA/ICdlbmQgb2YgaW5wdXQnIDogJ1xcJycgKyAodGhpcy50ZXJtaW5hbHNfW3N5bWJvbF0gfHwgc3ltYm9sKSArICdcXCcnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5wYXJzZUVycm9yKGVyclN0ciwge1xuICAgICAgICAgICAgICAgICAgICB0ZXh0OiBsZXhlci5tYXRjaCxcbiAgICAgICAgICAgICAgICAgICAgdG9rZW46IHRoaXMudGVybWluYWxzX1tzeW1ib2xdIHx8IHN5bWJvbCxcbiAgICAgICAgICAgICAgICAgICAgbGluZTogbGV4ZXIueXlsaW5lbm8sXG4gICAgICAgICAgICAgICAgICAgIGxvYzogeXlsb2MsXG4gICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBleHBlY3RlZFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICBpZiAoYWN0aW9uWzBdIGluc3RhbmNlb2YgQXJyYXkgJiYgYWN0aW9uLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignUGFyc2UgRXJyb3I6IG11bHRpcGxlIGFjdGlvbnMgcG9zc2libGUgYXQgc3RhdGU6ICcgKyBzdGF0ZSArICcsIHRva2VuOiAnICsgc3ltYm9sKTtcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKGFjdGlvblswXSkge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICBzdGFjay5wdXNoKHN5bWJvbCk7XG4gICAgICAgICAgICB2c3RhY2sucHVzaChsZXhlci55eXRleHQpO1xuICAgICAgICAgICAgbHN0YWNrLnB1c2gobGV4ZXIueXlsbG9jKTtcbiAgICAgICAgICAgIHN0YWNrLnB1c2goYWN0aW9uWzFdKTtcbiAgICAgICAgICAgIHN5bWJvbCA9IG51bGw7XG4gICAgICAgICAgICBpZiAoIXByZUVycm9yU3ltYm9sKSB7XG4gICAgICAgICAgICAgICAgeXlsZW5nID0gbGV4ZXIueXlsZW5nO1xuICAgICAgICAgICAgICAgIHl5dGV4dCA9IGxleGVyLnl5dGV4dDtcbiAgICAgICAgICAgICAgICB5eWxpbmVubyA9IGxleGVyLnl5bGluZW5vO1xuICAgICAgICAgICAgICAgIHl5bG9jID0gbGV4ZXIueXlsbG9jO1xuICAgICAgICAgICAgICAgIGlmIChyZWNvdmVyaW5nID4gMCkge1xuICAgICAgICAgICAgICAgICAgICByZWNvdmVyaW5nLS07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzeW1ib2wgPSBwcmVFcnJvclN5bWJvbDtcbiAgICAgICAgICAgICAgICBwcmVFcnJvclN5bWJvbCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgbGVuID0gdGhpcy5wcm9kdWN0aW9uc19bYWN0aW9uWzFdXVsxXTtcbiAgICAgICAgICAgIHl5dmFsLiQgPSB2c3RhY2tbdnN0YWNrLmxlbmd0aCAtIGxlbl07XG4gICAgICAgICAgICB5eXZhbC5fJCA9IHtcbiAgICAgICAgICAgICAgICBmaXJzdF9saW5lOiBsc3RhY2tbbHN0YWNrLmxlbmd0aCAtIChsZW4gfHwgMSldLmZpcnN0X2xpbmUsXG4gICAgICAgICAgICAgICAgbGFzdF9saW5lOiBsc3RhY2tbbHN0YWNrLmxlbmd0aCAtIDFdLmxhc3RfbGluZSxcbiAgICAgICAgICAgICAgICBmaXJzdF9jb2x1bW46IGxzdGFja1tsc3RhY2subGVuZ3RoIC0gKGxlbiB8fCAxKV0uZmlyc3RfY29sdW1uLFxuICAgICAgICAgICAgICAgIGxhc3RfY29sdW1uOiBsc3RhY2tbbHN0YWNrLmxlbmd0aCAtIDFdLmxhc3RfY29sdW1uXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKHJhbmdlcykge1xuICAgICAgICAgICAgICAgIHl5dmFsLl8kLnJhbmdlID0gW1xuICAgICAgICAgICAgICAgICAgICBsc3RhY2tbbHN0YWNrLmxlbmd0aCAtIChsZW4gfHwgMSldLnJhbmdlWzBdLFxuICAgICAgICAgICAgICAgICAgICBsc3RhY2tbbHN0YWNrLmxlbmd0aCAtIDFdLnJhbmdlWzFdXG4gICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHIgPSB0aGlzLnBlcmZvcm1BY3Rpb24uYXBwbHkoeXl2YWwsIFtcbiAgICAgICAgICAgICAgICB5eXRleHQsXG4gICAgICAgICAgICAgICAgeXlsZW5nLFxuICAgICAgICAgICAgICAgIHl5bGluZW5vLFxuICAgICAgICAgICAgICAgIHNoYXJlZFN0YXRlLnl5LFxuICAgICAgICAgICAgICAgIGFjdGlvblsxXSxcbiAgICAgICAgICAgICAgICB2c3RhY2ssXG4gICAgICAgICAgICAgICAgbHN0YWNrXG4gICAgICAgICAgICBdLmNvbmNhdChhcmdzKSk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAobGVuKSB7XG4gICAgICAgICAgICAgICAgc3RhY2sgPSBzdGFjay5zbGljZSgwLCAtMSAqIGxlbiAqIDIpO1xuICAgICAgICAgICAgICAgIHZzdGFjayA9IHZzdGFjay5zbGljZSgwLCAtMSAqIGxlbik7XG4gICAgICAgICAgICAgICAgbHN0YWNrID0gbHN0YWNrLnNsaWNlKDAsIC0xICogbGVuKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHN0YWNrLnB1c2godGhpcy5wcm9kdWN0aW9uc19bYWN0aW9uWzFdXVswXSk7XG4gICAgICAgICAgICB2c3RhY2sucHVzaCh5eXZhbC4kKTtcbiAgICAgICAgICAgIGxzdGFjay5wdXNoKHl5dmFsLl8kKTtcbiAgICAgICAgICAgIG5ld1N0YXRlID0gdGFibGVbc3RhY2tbc3RhY2subGVuZ3RoIC0gMl1dW3N0YWNrW3N0YWNrLmxlbmd0aCAtIDFdXTtcbiAgICAgICAgICAgIHN0YWNrLnB1c2gobmV3U3RhdGUpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xufX07XG4vKiBnZW5lcmF0ZWQgYnkgamlzb24tbGV4IDAuMy40ICovXG52YXIgbGV4ZXIgPSAoZnVuY3Rpb24oKXtcbnZhciBsZXhlciA9ICh7XG5cbkVPRjoxLFxuXG5wYXJzZUVycm9yOmZ1bmN0aW9uIHBhcnNlRXJyb3Ioc3RyLCBoYXNoKSB7XG4gICAgICAgIGlmICh0aGlzLnl5LnBhcnNlcikge1xuICAgICAgICAgICAgdGhpcy55eS5wYXJzZXIucGFyc2VFcnJvcihzdHIsIGhhc2gpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKHN0cik7XG4gICAgICAgIH1cbiAgICB9LFxuXG4vLyByZXNldHMgdGhlIGxleGVyLCBzZXRzIG5ldyBpbnB1dFxuc2V0SW5wdXQ6ZnVuY3Rpb24gKGlucHV0LCB5eSkge1xuICAgICAgICB0aGlzLnl5ID0geXkgfHwgdGhpcy55eSB8fCB7fTtcbiAgICAgICAgdGhpcy5faW5wdXQgPSBpbnB1dDtcbiAgICAgICAgdGhpcy5fbW9yZSA9IHRoaXMuX2JhY2t0cmFjayA9IHRoaXMuZG9uZSA9IGZhbHNlO1xuICAgICAgICB0aGlzLnl5bGluZW5vID0gdGhpcy55eWxlbmcgPSAwO1xuICAgICAgICB0aGlzLnl5dGV4dCA9IHRoaXMubWF0Y2hlZCA9IHRoaXMubWF0Y2ggPSAnJztcbiAgICAgICAgdGhpcy5jb25kaXRpb25TdGFjayA9IFsnSU5JVElBTCddO1xuICAgICAgICB0aGlzLnl5bGxvYyA9IHtcbiAgICAgICAgICAgIGZpcnN0X2xpbmU6IDEsXG4gICAgICAgICAgICBmaXJzdF9jb2x1bW46IDAsXG4gICAgICAgICAgICBsYXN0X2xpbmU6IDEsXG4gICAgICAgICAgICBsYXN0X2NvbHVtbjogMFxuICAgICAgICB9O1xuICAgICAgICBpZiAodGhpcy5vcHRpb25zLnJhbmdlcykge1xuICAgICAgICAgICAgdGhpcy55eWxsb2MucmFuZ2UgPSBbMCwwXTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLm9mZnNldCA9IDA7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbi8vIGNvbnN1bWVzIGFuZCByZXR1cm5zIG9uZSBjaGFyIGZyb20gdGhlIGlucHV0XG5pbnB1dDpmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjaCA9IHRoaXMuX2lucHV0WzBdO1xuICAgICAgICB0aGlzLnl5dGV4dCArPSBjaDtcbiAgICAgICAgdGhpcy55eWxlbmcrKztcbiAgICAgICAgdGhpcy5vZmZzZXQrKztcbiAgICAgICAgdGhpcy5tYXRjaCArPSBjaDtcbiAgICAgICAgdGhpcy5tYXRjaGVkICs9IGNoO1xuICAgICAgICB2YXIgbGluZXMgPSBjaC5tYXRjaCgvKD86XFxyXFxuP3xcXG4pLiovZyk7XG4gICAgICAgIGlmIChsaW5lcykge1xuICAgICAgICAgICAgdGhpcy55eWxpbmVubysrO1xuICAgICAgICAgICAgdGhpcy55eWxsb2MubGFzdF9saW5lKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGlzLnl5bGxvYy5sYXN0X2NvbHVtbisrO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMucmFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLnl5bGxvYy5yYW5nZVsxXSsrO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5faW5wdXQgPSB0aGlzLl9pbnB1dC5zbGljZSgxKTtcbiAgICAgICAgcmV0dXJuIGNoO1xuICAgIH0sXG5cbi8vIHVuc2hpZnRzIG9uZSBjaGFyIChvciBhIHN0cmluZykgaW50byB0aGUgaW5wdXRcbnVucHV0OmZ1bmN0aW9uIChjaCkge1xuICAgICAgICB2YXIgbGVuID0gY2gubGVuZ3RoO1xuICAgICAgICB2YXIgbGluZXMgPSBjaC5zcGxpdCgvKD86XFxyXFxuP3xcXG4pL2cpO1xuXG4gICAgICAgIHRoaXMuX2lucHV0ID0gY2ggKyB0aGlzLl9pbnB1dDtcbiAgICAgICAgdGhpcy55eXRleHQgPSB0aGlzLnl5dGV4dC5zdWJzdHIoMCwgdGhpcy55eXRleHQubGVuZ3RoIC0gbGVuKTtcbiAgICAgICAgLy90aGlzLnl5bGVuZyAtPSBsZW47XG4gICAgICAgIHRoaXMub2Zmc2V0IC09IGxlbjtcbiAgICAgICAgdmFyIG9sZExpbmVzID0gdGhpcy5tYXRjaC5zcGxpdCgvKD86XFxyXFxuP3xcXG4pL2cpO1xuICAgICAgICB0aGlzLm1hdGNoID0gdGhpcy5tYXRjaC5zdWJzdHIoMCwgdGhpcy5tYXRjaC5sZW5ndGggLSAxKTtcbiAgICAgICAgdGhpcy5tYXRjaGVkID0gdGhpcy5tYXRjaGVkLnN1YnN0cigwLCB0aGlzLm1hdGNoZWQubGVuZ3RoIC0gMSk7XG5cbiAgICAgICAgaWYgKGxpbmVzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICAgIHRoaXMueXlsaW5lbm8gLT0gbGluZXMubGVuZ3RoIC0gMTtcbiAgICAgICAgfVxuICAgICAgICB2YXIgciA9IHRoaXMueXlsbG9jLnJhbmdlO1xuXG4gICAgICAgIHRoaXMueXlsbG9jID0ge1xuICAgICAgICAgICAgZmlyc3RfbGluZTogdGhpcy55eWxsb2MuZmlyc3RfbGluZSxcbiAgICAgICAgICAgIGxhc3RfbGluZTogdGhpcy55eWxpbmVubyArIDEsXG4gICAgICAgICAgICBmaXJzdF9jb2x1bW46IHRoaXMueXlsbG9jLmZpcnN0X2NvbHVtbixcbiAgICAgICAgICAgIGxhc3RfY29sdW1uOiBsaW5lcyA/XG4gICAgICAgICAgICAgICAgKGxpbmVzLmxlbmd0aCA9PT0gb2xkTGluZXMubGVuZ3RoID8gdGhpcy55eWxsb2MuZmlyc3RfY29sdW1uIDogMClcbiAgICAgICAgICAgICAgICAgKyBvbGRMaW5lc1tvbGRMaW5lcy5sZW5ndGggLSBsaW5lcy5sZW5ndGhdLmxlbmd0aCAtIGxpbmVzWzBdLmxlbmd0aCA6XG4gICAgICAgICAgICAgIHRoaXMueXlsbG9jLmZpcnN0X2NvbHVtbiAtIGxlblxuICAgICAgICB9O1xuXG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMucmFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLnl5bGxvYy5yYW5nZSA9IFtyWzBdLCByWzBdICsgdGhpcy55eWxlbmcgLSBsZW5dO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMueXlsZW5nID0gdGhpcy55eXRleHQubGVuZ3RoO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4vLyBXaGVuIGNhbGxlZCBmcm9tIGFjdGlvbiwgY2FjaGVzIG1hdGNoZWQgdGV4dCBhbmQgYXBwZW5kcyBpdCBvbiBuZXh0IGFjdGlvblxubW9yZTpmdW5jdGlvbiAoKSB7XG4gICAgICAgIHRoaXMuX21vcmUgPSB0cnVlO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4vLyBXaGVuIGNhbGxlZCBmcm9tIGFjdGlvbiwgc2lnbmFscyB0aGUgbGV4ZXIgdGhhdCB0aGlzIHJ1bGUgZmFpbHMgdG8gbWF0Y2ggdGhlIGlucHV0LCBzbyB0aGUgbmV4dCBtYXRjaGluZyBydWxlIChyZWdleCkgc2hvdWxkIGJlIHRlc3RlZCBpbnN0ZWFkLlxucmVqZWN0OmZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5iYWNrdHJhY2tfbGV4ZXIpIHtcbiAgICAgICAgICAgIHRoaXMuX2JhY2t0cmFjayA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJzZUVycm9yKCdMZXhpY2FsIGVycm9yIG9uIGxpbmUgJyArICh0aGlzLnl5bGluZW5vICsgMSkgKyAnLiBZb3UgY2FuIG9ubHkgaW52b2tlIHJlamVjdCgpIGluIHRoZSBsZXhlciB3aGVuIHRoZSBsZXhlciBpcyBvZiB0aGUgYmFja3RyYWNraW5nIHBlcnN1YXNpb24gKG9wdGlvbnMuYmFja3RyYWNrX2xleGVyID0gdHJ1ZSkuXFxuJyArIHRoaXMuc2hvd1Bvc2l0aW9uKCksIHtcbiAgICAgICAgICAgICAgICB0ZXh0OiBcIlwiLFxuICAgICAgICAgICAgICAgIHRva2VuOiBudWxsLFxuICAgICAgICAgICAgICAgIGxpbmU6IHRoaXMueXlsaW5lbm9cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuLy8gcmV0YWluIGZpcnN0IG4gY2hhcmFjdGVycyBvZiB0aGUgbWF0Y2hcbmxlc3M6ZnVuY3Rpb24gKG4pIHtcbiAgICAgICAgdGhpcy51bnB1dCh0aGlzLm1hdGNoLnNsaWNlKG4pKTtcbiAgICB9LFxuXG4vLyBkaXNwbGF5cyBhbHJlYWR5IG1hdGNoZWQgaW5wdXQsIGkuZS4gZm9yIGVycm9yIG1lc3NhZ2VzXG5wYXN0SW5wdXQ6ZnVuY3Rpb24gKCkge1xuICAgICAgICB2YXIgcGFzdCA9IHRoaXMubWF0Y2hlZC5zdWJzdHIoMCwgdGhpcy5tYXRjaGVkLmxlbmd0aCAtIHRoaXMubWF0Y2gubGVuZ3RoKTtcbiAgICAgICAgcmV0dXJuIChwYXN0Lmxlbmd0aCA+IDIwID8gJy4uLic6JycpICsgcGFzdC5zdWJzdHIoLTIwKS5yZXBsYWNlKC9cXG4vZywgXCJcIik7XG4gICAgfSxcblxuLy8gZGlzcGxheXMgdXBjb21pbmcgaW5wdXQsIGkuZS4gZm9yIGVycm9yIG1lc3NhZ2VzXG51cGNvbWluZ0lucHV0OmZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIG5leHQgPSB0aGlzLm1hdGNoO1xuICAgICAgICBpZiAobmV4dC5sZW5ndGggPCAyMCkge1xuICAgICAgICAgICAgbmV4dCArPSB0aGlzLl9pbnB1dC5zdWJzdHIoMCwgMjAtbmV4dC5sZW5ndGgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAobmV4dC5zdWJzdHIoMCwyMCkgKyAobmV4dC5sZW5ndGggPiAyMCA/ICcuLi4nIDogJycpKS5yZXBsYWNlKC9cXG4vZywgXCJcIik7XG4gICAgfSxcblxuLy8gZGlzcGxheXMgdGhlIGNoYXJhY3RlciBwb3NpdGlvbiB3aGVyZSB0aGUgbGV4aW5nIGVycm9yIG9jY3VycmVkLCBpLmUuIGZvciBlcnJvciBtZXNzYWdlc1xuc2hvd1Bvc2l0aW9uOmZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHByZSA9IHRoaXMucGFzdElucHV0KCk7XG4gICAgICAgIHZhciBjID0gbmV3IEFycmF5KHByZS5sZW5ndGggKyAxKS5qb2luKFwiLVwiKTtcbiAgICAgICAgcmV0dXJuIHByZSArIHRoaXMudXBjb21pbmdJbnB1dCgpICsgXCJcXG5cIiArIGMgKyBcIl5cIjtcbiAgICB9LFxuXG4vLyB0ZXN0IHRoZSBsZXhlZCB0b2tlbjogcmV0dXJuIEZBTFNFIHdoZW4gbm90IGEgbWF0Y2gsIG90aGVyd2lzZSByZXR1cm4gdG9rZW5cbnRlc3RfbWF0Y2g6ZnVuY3Rpb24gKG1hdGNoLCBpbmRleGVkX3J1bGUpIHtcbiAgICAgICAgdmFyIHRva2VuLFxuICAgICAgICAgICAgbGluZXMsXG4gICAgICAgICAgICBiYWNrdXA7XG5cbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5iYWNrdHJhY2tfbGV4ZXIpIHtcbiAgICAgICAgICAgIC8vIHNhdmUgY29udGV4dFxuICAgICAgICAgICAgYmFja3VwID0ge1xuICAgICAgICAgICAgICAgIHl5bGluZW5vOiB0aGlzLnl5bGluZW5vLFxuICAgICAgICAgICAgICAgIHl5bGxvYzoge1xuICAgICAgICAgICAgICAgICAgICBmaXJzdF9saW5lOiB0aGlzLnl5bGxvYy5maXJzdF9saW5lLFxuICAgICAgICAgICAgICAgICAgICBsYXN0X2xpbmU6IHRoaXMubGFzdF9saW5lLFxuICAgICAgICAgICAgICAgICAgICBmaXJzdF9jb2x1bW46IHRoaXMueXlsbG9jLmZpcnN0X2NvbHVtbixcbiAgICAgICAgICAgICAgICAgICAgbGFzdF9jb2x1bW46IHRoaXMueXlsbG9jLmxhc3RfY29sdW1uXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB5eXRleHQ6IHRoaXMueXl0ZXh0LFxuICAgICAgICAgICAgICAgIG1hdGNoOiB0aGlzLm1hdGNoLFxuICAgICAgICAgICAgICAgIG1hdGNoZXM6IHRoaXMubWF0Y2hlcyxcbiAgICAgICAgICAgICAgICBtYXRjaGVkOiB0aGlzLm1hdGNoZWQsXG4gICAgICAgICAgICAgICAgeXlsZW5nOiB0aGlzLnl5bGVuZyxcbiAgICAgICAgICAgICAgICBvZmZzZXQ6IHRoaXMub2Zmc2V0LFxuICAgICAgICAgICAgICAgIF9tb3JlOiB0aGlzLl9tb3JlLFxuICAgICAgICAgICAgICAgIF9pbnB1dDogdGhpcy5faW5wdXQsXG4gICAgICAgICAgICAgICAgeXk6IHRoaXMueXksXG4gICAgICAgICAgICAgICAgY29uZGl0aW9uU3RhY2s6IHRoaXMuY29uZGl0aW9uU3RhY2suc2xpY2UoMCksXG4gICAgICAgICAgICAgICAgZG9uZTogdGhpcy5kb25lXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5yYW5nZXMpIHtcbiAgICAgICAgICAgICAgICBiYWNrdXAueXlsbG9jLnJhbmdlID0gdGhpcy55eWxsb2MucmFuZ2Uuc2xpY2UoMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBsaW5lcyA9IG1hdGNoWzBdLm1hdGNoKC8oPzpcXHJcXG4/fFxcbikuKi9nKTtcbiAgICAgICAgaWYgKGxpbmVzKSB7XG4gICAgICAgICAgICB0aGlzLnl5bGluZW5vICs9IGxpbmVzLmxlbmd0aDtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnl5bGxvYyA9IHtcbiAgICAgICAgICAgIGZpcnN0X2xpbmU6IHRoaXMueXlsbG9jLmxhc3RfbGluZSxcbiAgICAgICAgICAgIGxhc3RfbGluZTogdGhpcy55eWxpbmVubyArIDEsXG4gICAgICAgICAgICBmaXJzdF9jb2x1bW46IHRoaXMueXlsbG9jLmxhc3RfY29sdW1uLFxuICAgICAgICAgICAgbGFzdF9jb2x1bW46IGxpbmVzID9cbiAgICAgICAgICAgICAgICAgICAgICAgICBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5sZW5ndGggLSBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5tYXRjaCgvXFxyP1xcbj8vKVswXS5sZW5ndGggOlxuICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMueXlsbG9jLmxhc3RfY29sdW1uICsgbWF0Y2hbMF0ubGVuZ3RoXG4gICAgICAgIH07XG4gICAgICAgIHRoaXMueXl0ZXh0ICs9IG1hdGNoWzBdO1xuICAgICAgICB0aGlzLm1hdGNoICs9IG1hdGNoWzBdO1xuICAgICAgICB0aGlzLm1hdGNoZXMgPSBtYXRjaDtcbiAgICAgICAgdGhpcy55eWxlbmcgPSB0aGlzLnl5dGV4dC5sZW5ndGg7XG4gICAgICAgIGlmICh0aGlzLm9wdGlvbnMucmFuZ2VzKSB7XG4gICAgICAgICAgICB0aGlzLnl5bGxvYy5yYW5nZSA9IFt0aGlzLm9mZnNldCwgdGhpcy5vZmZzZXQgKz0gdGhpcy55eWxlbmddO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX21vcmUgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5fYmFja3RyYWNrID0gZmFsc2U7XG4gICAgICAgIHRoaXMuX2lucHV0ID0gdGhpcy5faW5wdXQuc2xpY2UobWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICAgICAgdGhpcy5tYXRjaGVkICs9IG1hdGNoWzBdO1xuICAgICAgICB0b2tlbiA9IHRoaXMucGVyZm9ybUFjdGlvbi5jYWxsKHRoaXMsIHRoaXMueXksIHRoaXMsIGluZGV4ZWRfcnVsZSwgdGhpcy5jb25kaXRpb25TdGFja1t0aGlzLmNvbmRpdGlvblN0YWNrLmxlbmd0aCAtIDFdKTtcbiAgICAgICAgaWYgKHRoaXMuZG9uZSAmJiB0aGlzLl9pbnB1dCkge1xuICAgICAgICAgICAgdGhpcy5kb25lID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRva2VuKSB7XG4gICAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fYmFja3RyYWNrKSB7XG4gICAgICAgICAgICAvLyByZWNvdmVyIGNvbnRleHRcbiAgICAgICAgICAgIGZvciAodmFyIGsgaW4gYmFja3VwKSB7XG4gICAgICAgICAgICAgICAgdGhpc1trXSA9IGJhY2t1cFtrXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTsgLy8gcnVsZSBhY3Rpb24gY2FsbGVkIHJlamVjdCgpIGltcGx5aW5nIHRoZSBuZXh0IHJ1bGUgc2hvdWxkIGJlIHRlc3RlZCBpbnN0ZWFkLlxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9LFxuXG4vLyByZXR1cm4gbmV4dCBtYXRjaCBpbiBpbnB1dFxubmV4dDpmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICh0aGlzLmRvbmUpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLkVPRjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIXRoaXMuX2lucHV0KSB7XG4gICAgICAgICAgICB0aGlzLmRvbmUgPSB0cnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHRva2VuLFxuICAgICAgICAgICAgbWF0Y2gsXG4gICAgICAgICAgICB0ZW1wTWF0Y2gsXG4gICAgICAgICAgICBpbmRleDtcbiAgICAgICAgaWYgKCF0aGlzLl9tb3JlKSB7XG4gICAgICAgICAgICB0aGlzLnl5dGV4dCA9ICcnO1xuICAgICAgICAgICAgdGhpcy5tYXRjaCA9ICcnO1xuICAgICAgICB9XG4gICAgICAgIHZhciBydWxlcyA9IHRoaXMuX2N1cnJlbnRSdWxlcygpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJ1bGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB0ZW1wTWF0Y2ggPSB0aGlzLl9pbnB1dC5tYXRjaCh0aGlzLnJ1bGVzW3J1bGVzW2ldXSk7XG4gICAgICAgICAgICBpZiAodGVtcE1hdGNoICYmICghbWF0Y2ggfHwgdGVtcE1hdGNoWzBdLmxlbmd0aCA+IG1hdGNoWzBdLmxlbmd0aCkpIHtcbiAgICAgICAgICAgICAgICBtYXRjaCA9IHRlbXBNYXRjaDtcbiAgICAgICAgICAgICAgICBpbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5iYWNrdHJhY2tfbGV4ZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgdG9rZW4gPSB0aGlzLnRlc3RfbWF0Y2godGVtcE1hdGNoLCBydWxlc1tpXSk7XG4gICAgICAgICAgICAgICAgICAgIGlmICh0b2tlbiAhPT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9iYWNrdHJhY2spIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTsgLy8gcnVsZSBhY3Rpb24gY2FsbGVkIHJlamVjdCgpIGltcGx5aW5nIGEgcnVsZSBNSVNtYXRjaC5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVsc2U6IHRoaXMgaXMgYSBsZXhlciBydWxlIHdoaWNoIGNvbnN1bWVzIGlucHV0IHdpdGhvdXQgcHJvZHVjaW5nIGEgdG9rZW4gKGUuZy4gd2hpdGVzcGFjZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIXRoaXMub3B0aW9ucy5mbGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIHRva2VuID0gdGhpcy50ZXN0X21hdGNoKG1hdGNoLCBydWxlc1tpbmRleF0pO1xuICAgICAgICAgICAgaWYgKHRva2VuICE9PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0b2tlbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGVsc2U6IHRoaXMgaXMgYSBsZXhlciBydWxlIHdoaWNoIGNvbnN1bWVzIGlucHV0IHdpdGhvdXQgcHJvZHVjaW5nIGEgdG9rZW4gKGUuZy4gd2hpdGVzcGFjZSlcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5faW5wdXQgPT09IFwiXCIpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLkVPRjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcnNlRXJyb3IoJ0xleGljYWwgZXJyb3Igb24gbGluZSAnICsgKHRoaXMueXlsaW5lbm8gKyAxKSArICcuIFVucmVjb2duaXplZCB0ZXh0LlxcbicgKyB0aGlzLnNob3dQb3NpdGlvbigpLCB7XG4gICAgICAgICAgICAgICAgdGV4dDogXCJcIixcbiAgICAgICAgICAgICAgICB0b2tlbjogbnVsbCxcbiAgICAgICAgICAgICAgICBsaW5lOiB0aGlzLnl5bGluZW5vXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH0sXG5cbi8vIHJldHVybiBuZXh0IG1hdGNoIHRoYXQgaGFzIGEgdG9rZW5cbmxleDpmdW5jdGlvbiBsZXgoKSB7XG4gICAgICAgIHZhciByID0gdGhpcy5uZXh0KCk7XG4gICAgICAgIGlmIChyKSB7XG4gICAgICAgICAgICByZXR1cm4gcjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmxleCgpO1xuICAgICAgICB9XG4gICAgfSxcblxuLy8gYWN0aXZhdGVzIGEgbmV3IGxleGVyIGNvbmRpdGlvbiBzdGF0ZSAocHVzaGVzIHRoZSBuZXcgbGV4ZXIgY29uZGl0aW9uIHN0YXRlIG9udG8gdGhlIGNvbmRpdGlvbiBzdGFjaylcbmJlZ2luOmZ1bmN0aW9uIGJlZ2luKGNvbmRpdGlvbikge1xuICAgICAgICB0aGlzLmNvbmRpdGlvblN0YWNrLnB1c2goY29uZGl0aW9uKTtcbiAgICB9LFxuXG4vLyBwb3AgdGhlIHByZXZpb3VzbHkgYWN0aXZlIGxleGVyIGNvbmRpdGlvbiBzdGF0ZSBvZmYgdGhlIGNvbmRpdGlvbiBzdGFja1xucG9wU3RhdGU6ZnVuY3Rpb24gcG9wU3RhdGUoKSB7XG4gICAgICAgIHZhciBuID0gdGhpcy5jb25kaXRpb25TdGFjay5sZW5ndGggLSAxO1xuICAgICAgICBpZiAobiA+IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmRpdGlvblN0YWNrLnBvcCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZGl0aW9uU3RhY2tbMF07XG4gICAgICAgIH1cbiAgICB9LFxuXG4vLyBwcm9kdWNlIHRoZSBsZXhlciBydWxlIHNldCB3aGljaCBpcyBhY3RpdmUgZm9yIHRoZSBjdXJyZW50bHkgYWN0aXZlIGxleGVyIGNvbmRpdGlvbiBzdGF0ZVxuX2N1cnJlbnRSdWxlczpmdW5jdGlvbiBfY3VycmVudFJ1bGVzKCkge1xuICAgICAgICBpZiAodGhpcy5jb25kaXRpb25TdGFjay5sZW5ndGggJiYgdGhpcy5jb25kaXRpb25TdGFja1t0aGlzLmNvbmRpdGlvblN0YWNrLmxlbmd0aCAtIDFdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25kaXRpb25zW3RoaXMuY29uZGl0aW9uU3RhY2tbdGhpcy5jb25kaXRpb25TdGFjay5sZW5ndGggLSAxXV0ucnVsZXM7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25kaXRpb25zW1wiSU5JVElBTFwiXS5ydWxlcztcbiAgICAgICAgfVxuICAgIH0sXG5cbi8vIHJldHVybiB0aGUgY3VycmVudGx5IGFjdGl2ZSBsZXhlciBjb25kaXRpb24gc3RhdGU7IHdoZW4gYW4gaW5kZXggYXJndW1lbnQgaXMgcHJvdmlkZWQgaXQgcHJvZHVjZXMgdGhlIE4tdGggcHJldmlvdXMgY29uZGl0aW9uIHN0YXRlLCBpZiBhdmFpbGFibGVcbnRvcFN0YXRlOmZ1bmN0aW9uIHRvcFN0YXRlKG4pIHtcbiAgICAgICAgbiA9IHRoaXMuY29uZGl0aW9uU3RhY2subGVuZ3RoIC0gMSAtIE1hdGguYWJzKG4gfHwgMCk7XG4gICAgICAgIGlmIChuID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmRpdGlvblN0YWNrW25dO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFwiSU5JVElBTFwiO1xuICAgICAgICB9XG4gICAgfSxcblxuLy8gYWxpYXMgZm9yIGJlZ2luKGNvbmRpdGlvbilcbnB1c2hTdGF0ZTpmdW5jdGlvbiBwdXNoU3RhdGUoY29uZGl0aW9uKSB7XG4gICAgICAgIHRoaXMuYmVnaW4oY29uZGl0aW9uKTtcbiAgICB9LFxuXG4vLyByZXR1cm4gdGhlIG51bWJlciBvZiBzdGF0ZXMgY3VycmVudGx5IG9uIHRoZSBzdGFja1xuc3RhdGVTdGFja1NpemU6ZnVuY3Rpb24gc3RhdGVTdGFja1NpemUoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbmRpdGlvblN0YWNrLmxlbmd0aDtcbiAgICB9LFxub3B0aW9uczoge1wiY2FzZS1pbnNlbnNpdGl2ZVwiOnRydWV9LFxucGVyZm9ybUFjdGlvbjogZnVuY3Rpb24gYW5vbnltb3VzKHl5LHl5XywkYXZvaWRpbmdfbmFtZV9jb2xsaXNpb25zLFlZX1NUQVJUKSB7XG52YXIgWVlTVEFURT1ZWV9TVEFSVDtcbnN3aXRjaCgkYXZvaWRpbmdfbmFtZV9jb2xsaXNpb25zKSB7XG5jYXNlIDA6LyogaWdub3JlIHdoaXRlc3BhY2VzICovXG5icmVhaztcbmNhc2UgMTovKiBpZ25vcmUgd2hpdGVzcGFjZXMgKi9cbmJyZWFrO1xuY2FzZSAyOi8qIG1vZGVsbGVlcnRhYWwgY29tbWVudCAqL1xuYnJlYWs7XG5jYXNlIDM6LyogQy1zdHlsZSBtdWx0aWxpbmUgY29tbWVudCAqL1xuYnJlYWs7XG5jYXNlIDQ6LyogQy1zdHlsZSBjb21tZW50ICovXG5icmVhaztcbmNhc2UgNTovKiBQeXRob24gc3R5bGUgY29tbWVudCAqL1xuYnJlYWs7XG5jYXNlIDY6cmV0dXJuIDE3XG5icmVhaztcbmNhc2UgNzpyZXR1cm4gMThcbmJyZWFrO1xuY2FzZSA4OnJldHVybiAzMVxuYnJlYWs7XG5jYXNlIDk6cmV0dXJuIDE5XG5icmVhaztcbmNhc2UgMTA6cmV0dXJuIDIxXG5icmVhaztcbmNhc2UgMTE6cmV0dXJuIDIzXG5icmVhaztcbmNhc2UgMTI6cmV0dXJuIDIwXG5icmVhaztcbmNhc2UgMTM6cmV0dXJuIDIyXG5icmVhaztcbmNhc2UgMTQ6cmV0dXJuIDI5XG5icmVhaztcbmNhc2UgMTU6cmV0dXJuIDMzXG5icmVhaztcbmNhc2UgMTY6cmV0dXJuIDMyXG5icmVhaztcbmNhc2UgMTc6cmV0dXJuIDhcbmJyZWFrO1xuY2FzZSAxODpyZXR1cm4gOFxuYnJlYWs7XG5jYXNlIDE5OnJldHVybiAzMFxuYnJlYWs7XG5jYXNlIDIwOnJldHVybiAzMFxuYnJlYWs7XG5jYXNlIDIxOnJldHVybiAzMFxuYnJlYWs7XG5jYXNlIDIyOnJldHVybiAyNFxuYnJlYWs7XG5jYXNlIDIzOnJldHVybiAyNVxuYnJlYWs7XG5jYXNlIDI0OnJldHVybiAyNlxuYnJlYWs7XG5jYXNlIDI1OnJldHVybiAyN1xuYnJlYWs7XG5jYXNlIDI2OnJldHVybiAyOFxuYnJlYWs7XG5jYXNlIDI3OnJldHVybiAxM1xuYnJlYWs7XG5jYXNlIDI4OnJldHVybiAxMFxuYnJlYWs7XG5jYXNlIDI5OnJldHVybiAxMlxuYnJlYWs7XG5jYXNlIDMwOnJldHVybiAxNVxuYnJlYWs7XG5jYXNlIDMxOnJldHVybiAxNFxuYnJlYWs7XG5jYXNlIDMyOnJldHVybiA3XG5icmVhaztcbmNhc2UgMzM6cmV0dXJuIDVcbmJyZWFrO1xufVxufSxcbnJ1bGVzOiBbL14oPzpcXHMrKS9pLC9eKD86XFx0KykvaSwvXig/OidbXlxcbl0qKS9pLC9eKD86XFwvXFwqKC58XFxufFxccikqP1xcKlxcLykvaSwvXig/OlxcL1xcL1teXFxuXSopL2ksL14oPzojW15cXG5dKikvaSwvXig/OlxcKCkvaSwvXig/OlxcKSkvaSwvXig/OnBpXFxiKS9pLC9eKD86PT0pL2ksL14oPzo+PSkvaSwvXig/Ojw9KS9pLC9eKD86PikvaSwvXig/OjwpL2ksL14oPzohfG5pZXRcXGIpL2ksL14oPzpvbndhYXJcXGIpL2ksL14oPzp3YWFyXFxiKS9pLC9eKD86PSkvaSwvXig/Ojo9KS9pLC9eKD86WzAtOV0qW1wiLlwiXCIsXCJdWzAtOV0rKFtFZV1bKy1dP1swLTldKyk/KS9pLC9eKD86WzAtOV0rW1wiLlwiXCIsXCJdWzAtOV0qKFtFZV1bKy1dP1swLTldKyk/KS9pLC9eKD86WzAtOV0rKFtFZV1bKy1dP1swLTldKyk/KS9pLC9eKD86XFxeKS9pLC9eKD86XFwrKS9pLC9eKD86LSkvaSwvXig/OlxcKikvaSwvXig/OlxcLykvaSwvXig/OmVpbmRhbHNcXGIpL2ksL14oPzphbHNcXGIpL2ksL14oPzpkYW5cXGIpL2ksL14oPzpzdG9wXFxiKS9pLC9eKD86YW5kZXJzXFxiKS9pLC9eKD86W2EtekEtWl1bYS16QS1aMC05X1wiXFxdXCJcIlxcfFwie31cIltcIl0qKS9pLC9eKD86JCkvaV0sXG5jb25kaXRpb25zOiB7XCJJTklUSUFMXCI6e1wicnVsZXNcIjpbMCwxLDIsMyw0LDUsNiw3LDgsOSwxMCwxMSwxMiwxMywxNCwxNSwxNiwxNywxOCwxOSwyMCwyMSwyMiwyMywyNCwyNSwyNiwyNywyOCwyOSwzMCwzMSwzMiwzM10sXCJpbmNsdXNpdmVcIjp0cnVlfX1cbn0pO1xucmV0dXJuIGxleGVyO1xufSkoKTtcbnBhcnNlci5sZXhlciA9IGxleGVyO1xuZnVuY3Rpb24gUGFyc2VyICgpIHtcbiAgdGhpcy55eSA9IHt9O1xufVxuUGFyc2VyLnByb3RvdHlwZSA9IHBhcnNlcjtwYXJzZXIuUGFyc2VyID0gUGFyc2VyO1xucmV0dXJuIG5ldyBQYXJzZXI7XG59KSgpO1xuXG5cbmlmICh0eXBlb2YgcmVxdWlyZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG5leHBvcnRzLnBhcnNlciA9IHBhcnNlcjtcbmV4cG9ydHMuUGFyc2VyID0gcGFyc2VyLlBhcnNlcjtcbmV4cG9ydHMucGFyc2UgPSBmdW5jdGlvbiAoKSB7IHJldHVybiBwYXJzZXIucGFyc2UuYXBwbHkocGFyc2VyLCBhcmd1bWVudHMpOyB9O1xuZXhwb3J0cy5tYWluID0gZnVuY3Rpb24gY29tbW9uanNNYWluKGFyZ3MpIHtcbiAgICBpZiAoIWFyZ3NbMV0pIHtcbiAgICAgICAgY29uc29sZS5sb2coJ1VzYWdlOiAnK2FyZ3NbMF0rJyBGSUxFJyk7XG4gICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gICAgdmFyIHNvdXJjZSA9IHJlcXVpcmUoJ2ZzJykucmVhZEZpbGVTeW5jKHJlcXVpcmUoJ3BhdGgnKS5ub3JtYWxpemUoYXJnc1sxXSksIFwidXRmOFwiKTtcbiAgICByZXR1cm4gZXhwb3J0cy5wYXJzZXIucGFyc2Uoc291cmNlKTtcbn07XG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgcmVxdWlyZS5tYWluID09PSBtb2R1bGUpIHtcbiAgZXhwb3J0cy5tYWluKHByb2Nlc3MuYXJndi5zbGljZSgxKSk7XG59XG59IixudWxsLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gcmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIGFycmF5IHdpdGggZGlyZWN0b3J5IG5hbWVzIHRoZXJlXG4vLyBtdXN0IGJlIG5vIHNsYXNoZXMsIGVtcHR5IGVsZW1lbnRzLCBvciBkZXZpY2UgbmFtZXMgKGM6XFwpIGluIHRoZSBhcnJheVxuLy8gKHNvIGFsc28gbm8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyAtIGl0IGRvZXMgbm90IGRpc3Rpbmd1aXNoXG4vLyByZWxhdGl2ZSBhbmQgYWJzb2x1dGUgcGF0aHMpXG5mdW5jdGlvbiBub3JtYWxpemVBcnJheShwYXJ0cywgYWxsb3dBYm92ZVJvb3QpIHtcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIGxhc3QgPSBwYXJ0c1tpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoYWxsb3dBYm92ZVJvb3QpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHBhcnRzLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnRzO1xufVxuXG4vLyBTcGxpdCBhIGZpbGVuYW1lIGludG8gW3Jvb3QsIGRpciwgYmFzZW5hbWUsIGV4dF0sIHVuaXggdmVyc2lvblxuLy8gJ3Jvb3QnIGlzIGp1c3QgYSBzbGFzaCwgb3Igbm90aGluZy5cbnZhciBzcGxpdFBhdGhSZSA9XG4gICAgL14oXFwvP3wpKFtcXHNcXFNdKj8pKCg/OlxcLnsxLDJ9fFteXFwvXSs/fCkoXFwuW14uXFwvXSp8KSkoPzpbXFwvXSopJC87XG52YXIgc3BsaXRQYXRoID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpO1xufTtcblxuLy8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXNvbHZlZFBhdGggPSAnJyxcbiAgICAgIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIHZhciBwYXRoID0gKGkgPj0gMCkgPyBhcmd1bWVudHNbaV0gOiBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBhbmQgaW52YWxpZCBlbnRyaWVzXG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9IGVsc2UgaWYgKCFwYXRoKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBwYXRoICsgJy8nICsgcmVzb2x2ZWRQYXRoO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHJlc29sdmVkUGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFyZXNvbHZlZEFic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgcmV0dXJuICgocmVzb2x2ZWRBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHJlc29sdmVkUGF0aCkgfHwgJy4nO1xufTtcblxuLy8gcGF0aC5ub3JtYWxpemUocGF0aClcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgaXNBYnNvbHV0ZSA9IGV4cG9ydHMuaXNBYnNvbHV0ZShwYXRoKSxcbiAgICAgIHRyYWlsaW5nU2xhc2ggPSBzdWJzdHIocGF0aCwgLTEpID09PSAnLyc7XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFpc0Fic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgaWYgKCFwYXRoICYmICFpc0Fic29sdXRlKSB7XG4gICAgcGF0aCA9ICcuJztcbiAgfVxuICBpZiAocGF0aCAmJiB0cmFpbGluZ1NsYXNoKSB7XG4gICAgcGF0aCArPSAnLyc7XG4gIH1cblxuICByZXR1cm4gKGlzQWJzb2x1dGUgPyAnLycgOiAnJykgKyBwYXRoO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5pc0Fic29sdXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICByZXR1cm4gZXhwb3J0cy5ub3JtYWxpemUoZmlsdGVyKHBhdGhzLCBmdW5jdGlvbihwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgcCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLmpvaW4gbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9KS5qb2luKCcvJykpO1xufTtcblxuXG4vLyBwYXRoLnJlbGF0aXZlKGZyb20sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZWxhdGl2ZSA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGZyb20gPSBleHBvcnRzLnJlc29sdmUoZnJvbSkuc3Vic3RyKDEpO1xuICB0byA9IGV4cG9ydHMucmVzb2x2ZSh0bykuc3Vic3RyKDEpO1xuXG4gIGZ1bmN0aW9uIHRyaW0oYXJyKSB7XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICBmb3IgKDsgc3RhcnQgPCBhcnIubGVuZ3RoOyBzdGFydCsrKSB7XG4gICAgICBpZiAoYXJyW3N0YXJ0XSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBhcnIubGVuZ3RoIC0gMTtcbiAgICBmb3IgKDsgZW5kID49IDA7IGVuZC0tKSB7XG4gICAgICBpZiAoYXJyW2VuZF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPiBlbmQpIHJldHVybiBbXTtcbiAgICByZXR1cm4gYXJyLnNsaWNlKHN0YXJ0LCBlbmQgLSBzdGFydCArIDEpO1xuICB9XG5cbiAgdmFyIGZyb21QYXJ0cyA9IHRyaW0oZnJvbS5zcGxpdCgnLycpKTtcbiAgdmFyIHRvUGFydHMgPSB0cmltKHRvLnNwbGl0KCcvJykpO1xuXG4gIHZhciBsZW5ndGggPSBNYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLCB0b1BhcnRzLmxlbmd0aCk7XG4gIHZhciBzYW1lUGFydHNMZW5ndGggPSBsZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZnJvbVBhcnRzW2ldICE9PSB0b1BhcnRzW2ldKSB7XG4gICAgICBzYW1lUGFydHNMZW5ndGggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgdmFyIG91dHB1dFBhcnRzID0gW107XG4gIGZvciAodmFyIGkgPSBzYW1lUGFydHNMZW5ndGg7IGkgPCBmcm9tUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRQYXJ0cy5wdXNoKCcuLicpO1xuICB9XG5cbiAgb3V0cHV0UGFydHMgPSBvdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtcblxuICByZXR1cm4gb3V0cHV0UGFydHMuam9pbignLycpO1xufTtcblxuZXhwb3J0cy5zZXAgPSAnLyc7XG5leHBvcnRzLmRlbGltaXRlciA9ICc6JztcblxuZXhwb3J0cy5kaXJuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgcmVzdWx0ID0gc3BsaXRQYXRoKHBhdGgpLFxuICAgICAgcm9vdCA9IHJlc3VsdFswXSxcbiAgICAgIGRpciA9IHJlc3VsdFsxXTtcblxuICBpZiAoIXJvb3QgJiYgIWRpcikge1xuICAgIC8vIE5vIGRpcm5hbWUgd2hhdHNvZXZlclxuICAgIHJldHVybiAnLic7XG4gIH1cblxuICBpZiAoZGlyKSB7XG4gICAgLy8gSXQgaGFzIGEgZGlybmFtZSwgc3RyaXAgdHJhaWxpbmcgc2xhc2hcbiAgICBkaXIgPSBkaXIuc3Vic3RyKDAsIGRpci5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiByb290ICsgZGlyO1xufTtcblxuXG5leHBvcnRzLmJhc2VuYW1lID0gZnVuY3Rpb24ocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gc3BsaXRQYXRoKHBhdGgpWzJdO1xuICAvLyBUT0RPOiBtYWtlIHRoaXMgY29tcGFyaXNvbiBjYXNlLWluc2Vuc2l0aXZlIG9uIHdpbmRvd3M/XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5cbmV4cG9ydHMuZXh0bmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aChwYXRoKVszXTtcbn07XG5cbmZ1bmN0aW9uIGZpbHRlciAoeHMsIGYpIHtcbiAgICBpZiAoeHMuZmlsdGVyKSByZXR1cm4geHMuZmlsdGVyKGYpO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChmKHhzW2ldLCBpLCB4cykpIHJlcy5wdXNoKHhzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuLy8gU3RyaW5nLnByb3RvdHlwZS5zdWJzdHIgLSBuZWdhdGl2ZSBpbmRleCBkb24ndCB3b3JrIGluIElFOFxudmFyIHN1YnN0ciA9ICdhYicuc3Vic3RyKC0xKSA9PT0gJ2InXG4gICAgPyBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7IHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pIH1cbiAgICA6IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSBzdHIubGVuZ3RoICsgc3RhcnQ7XG4gICAgICAgIHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pO1xuICAgIH1cbjtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtxdWV1ZUluZGV4XS5ydW4oKTtcbiAgICAgICAgfVxuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgY3VycmVudFF1ZXVlID0gbnVsbDtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbn1cblxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICB2YXIgYXJncyA9IG5ldyBBcnJheShhcmd1bWVudHMubGVuZ3RoIC0gMSk7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKG5ldyBJdGVtKGZ1biwgYXJncykpO1xuICAgIGlmICghZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iXX0=
