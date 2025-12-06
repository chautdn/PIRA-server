# Report5 Unit Test

## Test Case Matrix

| Precondition / Condition / Confirm | Test Case 1 | Test Case 2 | Test Case 3 | Test Case 4 | Test Case 5 | Test Case 6 | Test Case 7 | Test Case 8 |
|------------------------------------|-------------|-------------|-------------|-------------|-------------|-------------|-------------|-------------|
| **Precondition**                  |             |             |             |             |             |             |             |             |
| User owns the message              | -           | -           | -           | -           | -           | -           | -           | -           |
| Message exists in conversation     | -           | -           | -           | -           | -           | -           | -           | -           |
| **Input**                      |             |             |             |             |             |             |             |             |
| Click delete button                | -           | -           | -           | -           | -           | -           | -           | -           |
| Invalidate message ID              | -           | -           | -           | -           | -           | -           | -           | -           |
| Delete other user message          | -           | -           | -           | -           | ✓           | -           | -           | -           |
| **Confirm**                        |             |             |             |             |             |             |             |             |
| **Return**                        |             |             |             |             |             |             |             |             |
|  Mesasage deleted successfully        | -           | -           | ✓           | -           | -           | -           | -           | -           |
| Remove from chat display           | -           | -           | ✓           | -           | -           | ✓           | ✓           | -           |
| Real-time delete sync              | -           | -           | -           | -           | -           | -           | ✓           | -           |
**Excepion**                        |             |             |             |             |             |             |             |             |
| Message not found                  | -           | ✓           | -           | ✓           | -           | -           | -           | -           |
| Already deleted message            | -           | -           | -           | ✓           | -           | -           | -           | ✓           |
| Socket disconnected                | -           | -           | -           | -           | -           | ✓           | -           | -           |
| **Log message**                          |             |             |             |             |             |             |             |             |
| Deleting message                   | -           | -           | ✓           | -           | -           | ✓           | -           | ✓           |
| Emitting delete event              | -           | ✓           | -           | -           | -           | ✓           | ✓           | -           |
| Error: (errorMessage)              | -           | -           | -           | ✓           | ✓           | -           | ✓           | ✓           |
| **Type** (N: Normal, A: Abnormal, B: Boundary) | N | A | N | A | A | N | A | B |

## Result Summary

| Condition / Confirm / Result | Test Case 1 | Test Case 2 | Test Case 3 | Test Case 4 | Test Case 5 | Test Case 6 | Test Case 7 | Test Case 8 |
|------------------------------|-------------|-------------|-------------|-------------|-------------|-------------|-------------|-------------|
| **Condition**                |             |             |             |             |             |             |             |             |
| Click delete button          | ✓           | -           | ✓           | ✓           | ✓           | ✓           | ✓           | ✓           |
| Confirm deletion             | ✓           | ✓           | -           | ✓           | -           | ✓           | ✓           | ✓           |
| Invalidate message ID        | -           | ✓           | -           | -           | ✓           | -           | -           | -           |
| Delete other user message    | -           | -           | ✓           | -           | -           | ✓           | -           | -           |
| **Confirm**                  |             |             |             |             |             |             |             |             |
| Return other user message    | ✓           | -           | -           | -           | ✓           | -           | ✓           | -           |
| Message deleted successfully | ✓           | ✓           | -           | -           | -           | -           | -           | ✓           |
| Remove from chat display     | ✓           | -           | ✓           | -           | -           | -           | -           | ✓           |
| Real-time delete sync        | -           | ✓           | ✓           | ✓           | -           | -           | -           | -           |
| **Confirm**                  |             |             |             |             |             |             |             |             |
| Message not found            | -           | -           | ✓           | -           | ✓           | -           | -           | -           |
| Access denied error          | -           | -           | -           | ✓           | -           | -           | ✓           | -           |
| Already deleted message      | -           | -           | -           | -           | -           | ✓           | -           | -           |
| Socket disconnected          | -           | -           | -           | -           | -           | -           | -           | ✓           |
| **Error**                    |             |             |             |             |             |             |             |             |
| Deleting message             | ✓           | -           | -           | ✓           | -           | -           | ✓           | -           |
| Soft delete marked           | ✓           | -           | -           | -           | ✓           | -           | -           | ✓           |
| Emitting delete event        | -           | ✓           | ✓           | -           | -           | ✓           | -           | -           |
| Error: (errorMessage)        | -           | -           | -           | ✓           | ✓           | -           | ✓           | ✓           |
| **Result**                   |             |             |             |             |             |             |             |             |
| Passed / Failed              | P₂          | P₂          | P₂          | P₂          | P₂          | P₂          | P₂          | P₂          |
| Executed Date                | -           | -           | -           | -           | -           | -           | -           | -           |
| Defect ID                    | -           | -           | -           | -           | -           | -           | -           | -           |
| **Type** (N: Normal, A: Abnormal, B: Boundary) | N | A | N | A | A | N | A | B |
| **Passed/Failed** | P | P | P | P | P | P | P | P |