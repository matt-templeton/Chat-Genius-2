// Test script to verify Python setup
const { runPythonScript } = require('./server/utils/pythonRunner');

async function testPythonSetup() {
  try {
    console.log('Testing Python setup...');
    const result = await runPythonScript('test.py');
    console.log('Python test result:', result);
    console.log('Python setup is working correctly!');
  } catch (error) {
    console.error('Python setup test failed:', error);
  }
}

testPythonSetup(); 