# Task Evaluation System

This document describes the new Task Evaluation System that allows managers to evaluate and update employee tasks, even for previous weeks.

## Overview

The Task Evaluation System extends the existing weekly report system to include:
- Manager evaluations of employee tasks
- Override capabilities for task completion status
- Evaluation history tracking
- Proper permission controls based on organizational hierarchy

## Database Schema

### New Models

#### TaskEvaluation
- `id`: Unique identifier
- `taskId`: Reference to the evaluated task
- `evaluatorId`: Reference to the manager who made the evaluation
- `originalIsCompleted`: Original task completion status
- `evaluatedIsCompleted`: Manager's evaluation of completion
- `originalReasonNotDone`: Original reason for non-completion
- `evaluatedReasonNotDone`: Manager's evaluation of the reason
- `evaluatorComment`: Manager's comment on the evaluation
- `evaluationType`: Type of evaluation (REVIEW, CORRECTION, APPROVAL, REJECTION)
- `createdAt/updatedAt`: Timestamps

#### EvaluationType Enum
- `REVIEW`: General review/evaluation
- `CORRECTION`: Correcting completion status
- `APPROVAL`: Approving task completion
- `REJECTION`: Rejecting task completion

### Updated Models

#### ReportTask
- Added `evaluations` relation to `TaskEvaluation[]`

#### User
- Added `evaluations` relation to `TaskEvaluation[]` (tasks this user has evaluated)

## API Endpoints

### Task Evaluations Controller (`/api/task-evaluations`)

#### POST `/` - Create Task Evaluation
Create a new evaluation for a task.

**Request Body:**
```json
{
  "taskId": "string",
  "evaluatedIsCompleted": boolean,
  "evaluatedReasonNotDone": "string (optional)",
  "evaluatorComment": "string (optional)",
  "evaluationType": "REVIEW|CORRECTION|APPROVAL|REJECTION"
}
```

#### PUT `/:evaluationId` - Update Task Evaluation
Update an existing evaluation.

#### GET `/task/:taskId` - Get Task Evaluations
Get all evaluations for a specific task.

#### GET `/my-evaluations` - Get My Evaluations
Get evaluations created by the current user.

**Query Parameters:**
- `weekNumber`: Filter by week number
- `year`: Filter by year
- `userId`: Filter by user ID
- `evaluationType`: Filter by evaluation type

#### GET `/evaluable-tasks` - Get Evaluable Tasks
Get tasks that can be evaluated by the current manager.

**Query Parameters:**
- `weekNumber`: Filter by week number
- `year`: Filter by year
- `userId`: Filter by user ID
- `isCompleted`: Filter by completion status

#### DELETE `/:evaluationId` - Delete Task Evaluation
Delete an evaluation (only your own evaluations).

## Permission System

### Who Can Evaluate Tasks

#### SUPERADMIN
- Can evaluate any task from any user
- Can view all evaluations

#### ADMIN
- Can evaluate tasks from users in their office
- Can view evaluations for their office

#### USER (with management permissions)
- Must have `canViewHierarchy=true` or `isManagement=true` in their position
- Can only evaluate tasks from subordinates in the same department
- Subordinates are determined by position level (higher level number = lower in hierarchy)

### Evaluation Rules

1. **Manager Permission Check**: System verifies the user has management permissions
2. **Hierarchy Check**: Ensures the task belongs to a subordinate
3. **Department Check**: Manager and employee must be in the same department (for regular managers)
4. **Office Check**: Admin users can only evaluate within their office

## Usage Examples

### Creating an Evaluation

```typescript
// Manager evaluating a task as incomplete with comment
const evaluation = await fetch('/api/task-evaluations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    taskId: 'task-123',
    evaluatedIsCompleted: false,
    evaluatedReasonNotDone: 'Task requires additional review',
    evaluatorComment: 'Please provide more details on the implementation approach',
    evaluationType: 'CORRECTION'
  })
});
```

### Getting Task Evaluations

```typescript
// Get all evaluations for a task
const evaluations = await fetch('/api/task-evaluations/task/task-123');

// Response includes evaluator information
{
  "id": "eval-123",
  "taskId": "task-123",
  "evaluatorId": "manager-456",
  "originalIsCompleted": true,
  "evaluatedIsCompleted": false,
  "evaluatorComment": "Needs revision",
  "evaluationType": "CORRECTION",
  "createdAt": "2024-01-15T10:30:00Z",
  "evaluator": {
    "id": "manager-456",
    "firstName": "John",
    "lastName": "Smith",
    "employeeCode": "MGR001",
    "jobPosition": {
      "position": {
        "name": "Department Manager",
        "level": 2
      },
      "department": {
        "name": "Engineering"
      }
    }
  }
}
```

### Updated Report Response

When users view their reports, they now see evaluation information:

```json
{
  "id": "report-123",
  "weekNumber": 29,
  "year": 2024,
  "tasks": [
    {
      "id": "task-123",
      "taskName": "Complete project documentation",
      "isCompleted": true,
      "reasonNotDone": null,
      "evaluations": [
        {
          "id": "eval-123",
          "evaluatedIsCompleted": false,
          "evaluatedReasonNotDone": "Documentation incomplete",
          "evaluatorComment": "Please add API documentation",
          "evaluationType": "CORRECTION",
          "createdAt": "2024-01-15T10:30:00Z",
          "evaluator": {
            "firstName": "John",
            "lastName": "Smith",
            "employeeCode": "MGR001",
            "jobPosition": {
              "position": {
                "name": "Department Manager"
              }
            }
          }
        }
      ]
    }
  ]
}
```

## Manager Dashboard Features

### Evaluable Tasks View

Managers can view all tasks that can be evaluated:

```typescript
// Get tasks that need evaluation
const tasks = await fetch('/api/task-evaluations/evaluable-tasks?isCompleted=false');

// Get tasks for a specific week
const weeklyTasks = await fetch('/api/task-evaluations/evaluable-tasks?weekNumber=29&year=2024');
```

### My Evaluations View

Managers can view their evaluation history:

```typescript
// Get all my evaluations
const myEvaluations = await fetch('/api/task-evaluations/my-evaluations');

// Get evaluations for a specific user
const userEvaluations = await fetch('/api/task-evaluations/my-evaluations?userId=employee-123');
```

## Integration with Existing System

### Manager Reports API

The existing manager reports API (`/api/hierarchy-reports/manager-reports`) now includes evaluation information in the subordinate reports.

### Report Display

When users view their reports via:
- `/api/reports/:id` (Get report by ID)
- `/api/reports/week/:weekNumber/:year` (Get report by week)

The response now includes evaluation information for each task, showing:
- Who evaluated the task
- What changes were made
- When the evaluation was created
- Manager comments

## Best Practices

### For Managers

1. **Use Appropriate Evaluation Types**:
   - `REVIEW`: General feedback and assessment
   - `CORRECTION`: When changing completion status
   - `APPROVAL`: Formally approving completed work
   - `REJECTION`: When work needs to be redone

2. **Provide Clear Comments**: Always include explanatory comments when making evaluations

3. **Timely Evaluations**: Evaluate tasks promptly to provide timely feedback

### For Developers

1. **Always Include Evaluations**: When querying tasks, include evaluation information
2. **Check Permissions**: Verify user has management permissions before showing evaluation UI
3. **Display Evaluation History**: Show the complete evaluation timeline for transparency

## Security Considerations

1. **Role-Based Access**: Only users with management permissions can create evaluations
2. **Hierarchy Enforcement**: Managers can only evaluate their direct subordinates
3. **Audit Trail**: All evaluations are logged with timestamps and evaluator information
4. **Data Integrity**: Original task data is preserved alongside evaluations

## Migration Guide

To implement the evaluation system:

1. **Run Database Migration**:
   ```bash
   # Apply the Prisma schema changes
   npx prisma migrate dev
   ```

2. **Update Frontend**: 
   - Add evaluation UI components
   - Update report displays to show evaluation information
   - Add manager evaluation dashboard

3. **Test Permissions**:
   - Verify hierarchy-based access control
   - Test evaluation creation and updates
   - Ensure users can see who evaluated their tasks

## Future Enhancements

Potential improvements to consider:

1. **Bulk Evaluations**: Allow managers to evaluate multiple tasks at once
2. **Evaluation Templates**: Pre-defined evaluation comments for common scenarios
3. **Notification System**: Notify users when their tasks are evaluated
4. **Evaluation Analytics**: Reports on evaluation patterns and manager feedback
5. **Employee Response**: Allow employees to respond to evaluations