# Test Files

This folder contains all test files for the PIRA server.

## Structure

```
test/
├── vietmap.test.js       # Vietmap API integration tests
├── payment.test.js       # Payment service tests
└── auth.test.js          # Authentication tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test test/vietmap.test.js

# Run with coverage
npm test -- --coverage
```

## Writing Tests

All test files should:

- End with `.test.js` or `.spec.js`
- Use descriptive test names
- Test both success and error cases
- Mock external dependencies (databases, APIs)
- Clean up after themselves

## Notes

- **GITIGNORED**: Test files are not deployed to production
- Keep tests focused and isolated
- Update tests when changing functionality
