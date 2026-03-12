# Demo Trace Case

## Incident Input

```json
{
  "context_id": "order_123",
  "context_type": "order_id",
  "symptom": "Order was created, but no task was generated.",
  "expected": "A task should be created and moved to pending state after order creation."
}
```

## Mock Investigation Facts

- trace lookup succeeds for the order flow
- trace shows `OrderCreateFlow` completed
- trace does not show `CreateTaskFlow`
- `order_main` contains the order row
- `task_main` does not contain any task row
- Redis contains `task:idempotent:order_123`
- the key TTL is positive

## Expected Report Shape

The report should conclude:

- the request entered the system
- the main order persistence succeeded
- task creation did not execute or was short-circuited
- stale idempotency or cache precondition is the most likely root cause

The report should not conclude:

- direct code bug with no evidence
- MQ failure if no MQ evidence exists
- downstream dependency failure if no dependency evidence exists
