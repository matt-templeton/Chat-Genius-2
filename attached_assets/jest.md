### Creating Unit Tests for Backend Routes with Jest

Let's create a comprehensive collection of unit tests for our backend routes using the Jest testing framework. Follow the steps below to set up and implement the tests effectively. Leverage the API documentation in openapi.json as well as the database schema definition in db.sql.

#### 1. Set Up the Testing Environment

1. Create Directory Structure
   - Create a tests/routes directory in your project to organize your route tests.

2. Initialize the Testing Framework
   - Set up Jest for your application if it's not already configured.

3. Configure the Testing Environment to Use the Development Database
   - Database Access:
     - Configure your tests to connect to the development database (dev database).
     - Ensure that your tests have the necessary permissions to read from and write to the development database.
   - Data Management:
     - Be mindful that tests will manipulate data in the development database.
     - Implement setup and teardown procedures to manage test data:
       - Setup: Prepare the necessary data before each test runs.
       - Teardown: Clean up any test data after each test completes to maintain database integrity.

#### 2. Develop Test Suites for Each Route

For every route file in server/routes, create a corresponding test suite file in tests/routes. Follow these instructions when writing each test suite:

1. Write Tests for Each Endpoint

   For every endpoint in the route, write tests that verify the following:

   - Authentication Requirements
     - Test: Ensure that unauthenticated requests to protected endpoints return the appropriate status code (e.g., 401 Unauthorized).

   - Data Validation
     - Test: Confirm that the server responds correctly when invalid or malformed data is sent to the endpoint (e.g., 400 Bad Request).

   - Successful Requests
     - Test: Verify that well-formed requests return the expected data and status codes (e.g., 200 OK).

   - API Schema Compliance
     - Test: Ensure that every aspect of the API schema defined in openapi.json is correctly implemented.
     - Verification: Check that the functionality and requirements specified in the OpenAPI documentation are fulfilled by the API implementation and validated by the tests.

2. Run and Refine Tests

   - Execute Test Suite: Run the tests using Jest.
   - Fix Issues: Address any failures or errors that arise.
   - Repeat: Continue running and refining the tests until all tests pass and all conditions are met.

#### 3. Handling Test Data

- Setup Dummy Data:
  - For each test, establish the necessary database state using dummy data.
  - Method: Interact with the server's API endpoints to set up this data where possible, ensuring that the tests mimic real-world usage.

- Data Cleanup:
  - After each test, ensure that any data inserted into the development database is cleaned up.
  - Technique: Use Jest's afterEach or afterAll hooks to remove test data and maintain database integrity.

- Data Integrity Assurance:
  - Verify that the database state is as expected before and after each test to prevent unintended side effects.

#### 4. Your Write Access Limitations

- You are to work exclusively on implementing tests and fixing the server repository.
- Do Not Edit: Do not make changes to any files in the /db directory.
- If Changes Are Needed:
  - If something arises that requires modifying the database schema or any files in the /db directory, stop and document what needs to change.
  - Provide a clear explanation of the issue and suggest potential solutions for review.

---

### Summary

By following this structured approach, you'll establish a robust testing framework that ensures your backend routes are reliable, secure, and compliant with your API specifications. Using the development database for testing allows you to work in an environment that closely mirrors production, leading to higher code quality and easier maintenance in the long run. Remember to manage test data carefully to maintain the integrity of the development database.