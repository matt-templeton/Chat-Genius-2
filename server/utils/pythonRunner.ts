import { spawn } from 'child_process';
import path from 'path';

/**
 * Run a Python script and return its output
 * @param scriptName Name of the script in the py directory
 * @param args Command line arguments for the script
 * @param stdinData Optional data to pass to the script via stdin
 * @returns Parsed JSON output from the script
 */
export function runPythonScript(scriptName: string, args: string[] = [], stdinData?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'server', 'py', scriptName);
    
    // Determine the Python executable path based on environment
    let pythonExecutable: string;
    
    if (process.env.PYTHON_EXECUTABLE) {
      // Use environment variable if set (useful for deployment)
      pythonExecutable = process.env.PYTHON_EXECUTABLE;
    } else if (process.env.AWS_AMPLIFY_APP_ID) {
      // We're in AWS Amplify environment
      pythonExecutable = 'python3';
    } else if (process.env.NODE_ENV === 'production') {
      // Generic production environment
      pythonExecutable = process.platform === 'win32' ? 'python' : 'python3';
    } else {
      // Development environment with virtual env
      pythonExecutable = process.platform === 'win32'
        ? path.join(process.cwd(), 'venv', 'Scripts', 'python.exe')
        : path.join(process.cwd(), 'venv', 'bin', 'python');
    }
    
    console.log(`Using Python executable: ${pythonExecutable}`);
    
    const pythonProcess = spawn(pythonExecutable, [scriptPath, ...args], {
      env: {
        ...process.env,
        // Add any environment-specific settings here if needed
      }
    });

    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python script failed with code ${code}${errorData ? ': ' + errorData : ''}`));
        return;
      }

      try {
        const parsedOutput = JSON.parse(outputData);
        if (parsedOutput.error) {
          reject(new Error(parsedOutput.error));
          return;
        }
        resolve(parsedOutput);
      } catch (e) {
        reject(new Error(`Failed to parse Python script output: ${outputData}`));
      }
    });

    // If we have stdin data, write it to the process
    if (stdinData !== undefined) {
      pythonProcess.stdin.write(JSON.stringify(stdinData));
      pythonProcess.stdin.end();
    }
  });
} 