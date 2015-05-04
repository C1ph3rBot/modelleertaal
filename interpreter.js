/*
    Interpreter for Modelleertaal (modelregels)
    Simple dynamical models for highschool Physics in NL

    The language is described in modelleertaal.jison

    usage:
      npm install path_to/jison
      node interpreter.js
*/


// CommonJS
var fs = require("fs");
var jison = require("jison");

// input sourcode:
var program = fs.readFileSync("model.txt", "utf8")

// parser compiled on execution by jison.js
var bnf = fs.readFileSync("modelleertaal.jison", "utf8");
var parser = new jison.Parser(bnf);


// for some reason the jison example uses print()
// this is a lame implemenations to allow:
// print(string) and print("var = ", variable)
function print(string1, string2) {
    if (arguments.length == 1) {
        console.log(string1)
    } else { console.log(string1, string2) }
}



function main () {
    print('*** input ***');
    print(program);

    var ast = parser.parse(program);

    print('*** AST ***');
    print(JSON.stringify(ast, undefined, 4));

    print('')
    evaluate(ast);
}


// http://stackoverflow.com/questions/7364150/find-object-by-id-in-array-of-javascript-objects
// array = [{key:value},{key:value}]
function objectFindByKey(array, key, value) {
    for (var i = 0; i < array.length; i++) {
        if (array[i][key] === value) {
            return array[i];
        }
    }
    return null;
}

function InterpreterVariable(variableName, value) {
  this.variableName = variableName;
  this.value = value;
}

function evaluate(ast) {

    /* This is the interpreter */

    function parseNode(node) {
        /* parseNode is a recursive function that parses an item
            of the JSON AST. Calls itself to traverse through nodes.
        */

        // add an extra space to identation for recursive each call
        identation = identation+'  ';

        print(identation+'parseNode: ', node.type);

        if (node.type == 'Assignment') {
            print(identation+'Assigment recursion');
            var value = parseNode(node.right);

            // check if variable already in the array of variables
            if (objectFindByKey(variables, 'variableName', node.left)==null) {
                variables.push(new InterpreterVariable(node.left, value)) }
            else {
                objectFindByKey(variables, 'variableName', node.left).value=value;
            };
            print(identation+'vars = ',variables);
            print(identation+'return value (Assignment) = ', value);
            return value
        }

        if (node.type == 'Variable') {
            print(identation+'Variable recursion');

            // TODO: Add constants list and look that up first
            print(identation+"looking up",node.name)
            var value = objectFindByKey(variables, 'variableName', node.name).value;

            print(identation+"found: ", value);
            return value;
        }

        if (node.type == 'Binary') {
            print(identation+'Binary operator recursion');
            print(identation+'Operator = ', node.operator);
            var left = parseNode(node.left);
            var right = parseNode(node.right);
            switch (node.operator) {
                case '+':
                    return left + right;
                case '-':
                    return left - right;
                case '*':
                    return left * right;
                case '/':
                    return left / right;
                default:
                    throw new SyntaxError('Unknown binary operator ' + node.operator);
                }
        }

        if (node.type == 'Unary') {
            print(identation+'Unary operator recursion');
            print(identation+'Operator = ', node.operator);
            var right = parseNode(node.right);
            switch (node.operator) {
                case '+':
                    return right;
                case '-':
                    return -right;

                default:
                    throw new SyntaxError('Unknown unary operator ' + node.operator);
                }
        }
        if (node.type == 'Number') {
            print(identation+'return value (Number) =', parseFloat(node.value));
            return parseFloat(node.value);
        }
    };

    // TODO: Add list of constants (startwaarden)
    var variables = [];  // list of variables for the interpreter

    print("***** Start evaluation of AST *** ")
    for (var i = 0; i < ast.length; i++) {
        identation = ''; // string used for identation (debugging)
        print("AST item = ",ast[i])
        print("*** start evaluate()")
        var value = parseNode(ast[i]); }
        print("item evaluates to ", value);

    print("*** variables at end of execution = ", variables)

};


main();
