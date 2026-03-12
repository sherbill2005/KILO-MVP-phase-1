const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBatchPayload } = require('../src/validation.js');

test("rejects missing exercise_name", () => {
    const result = validateBatchPayload({
        sets: [{ weight_value: 100, weight_unit: 'kg', reps: 10 }]
    }); assert.equal(result.ok, false);
});
test("rejects empty sets", () => { 
    const result = validateBatchPayload({
        exercise_name: 'Squat',
        sets: []
    }); assert.equal(result.ok, false);
});

test("Accept valid payload", () => {
    const result = validateBatchPayload({
        exercise_name: 'Squat',
        sets: [{ weight_value: 100, weight_unit: 'kg', reps: 10 }]
    }); assert.equal(result.ok, true);
});