import json
import sys

def main():
    result = {
        'success': True
    }
    # Print JSON to stdout for the Node process to capture
    print(json.dumps(result))

if __name__ == "__main__":
    main() 