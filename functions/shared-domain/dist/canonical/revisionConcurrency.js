"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertExpectedRevision = assertExpectedRevision;
exports.nextAggregateRevision = nextAggregateRevision;
exports.readAggregateRevision = readAggregateRevision;
const primitives_1 = require("./primitives");
const errors_1 = require("./errors");
function assertExpectedRevision(input) {
    const { correlationId, expectedRevision, currentRevision, requireExpectedRevision } = input;
    if (expectedRevision === undefined) {
        if (requireExpectedRevision) {
            throw new errors_1.CanonicalCommandError('validation', {
                correlationId,
                details: { field: 'expectedRevision', reason: 'required' },
            });
        }
        return;
    }
    if (currentRevision === undefined) {
        throw new errors_1.CanonicalCommandError('stale_version', {
            correlationId,
            currentRevision: primitives_1.AggregateRevisionSchema.parse(0),
        });
    }
    if (currentRevision !== expectedRevision) {
        throw new errors_1.CanonicalCommandError('stale_version', {
            correlationId,
            currentRevision,
        });
    }
}
function nextAggregateRevision(current) {
    return primitives_1.AggregateRevisionSchema.parse(current + 1);
}
function readAggregateRevision(data) {
    if (!data || !('revision' in data)) {
        return undefined;
    }
    const parsed = primitives_1.AggregateRevisionSchema.safeParse(data.revision);
    return parsed.success ? parsed.data : undefined;
}
