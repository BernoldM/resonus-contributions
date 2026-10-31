/** The corner sliders (src/lib/corners.ts). */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coverRadiusAt, radiusAt, savedBorderRadius, savedCoverCorners } from '@/lib/corners';

describe('radiusAt', () => {
  it('is sharp at 0 but keeps capsules', () => {
    assert.deepEqual(radiusAt(0), { sm: 0, md: 0, lg: 0, xl: 0, xxl: 0, pill: 999 });
  });
  it('draws the old ladders at their stops', () => {
    assert.deepEqual(radiusAt(80), { sm: 4, md: 8, lg: 12, xl: 12, xxl: 12, pill: 999 });
    assert.deepEqual(radiusAt(100), { sm: 6, md: 10, lg: 16, xl: 24, xxl: 32, pill: 999 });
  });
});

describe('coverRadiusAt', () => {
  it('draws the old choices at their stops', () => {
    for (const size of [48, 120, 300]) assert.equal(coverRadiusAt(0, size), 0);
    assert.equal(coverRadiusAt(50, 48), 6);
    assert.equal(coverRadiusAt(50, 300), 10);
    assert.equal(coverRadiusAt(100, 48), 10);
    assert.equal(coverRadiusAt(100, 120), 16);
    assert.equal(coverRadiusAt(100, 300), 24);
  });
});

describe('saved settings', () => {
  it('keeps numbers, including 0', () => {
    assert.equal(savedBorderRadius(0, 'round'), 0);
    assert.equal(savedCoverCorners(0, 'round'), 0);
  });
  it('moves the old choices over', () => {
    assert.equal(savedBorderRadius(undefined, 'pointier'), 80);
    assert.equal(savedBorderRadius(undefined, undefined), 100);
    assert.equal(savedCoverCorners('square', 'pointier'), 0);
    assert.equal(savedCoverCorners('rounded', 'round'), 50);
    assert.equal(savedCoverCorners('rounded', 'pointier'), 40);
    assert.equal(savedCoverCorners('round', 'round'), 100);
    assert.equal(savedCoverCorners(undefined, undefined), 50);
  });
  it('ignores values out of range', () => {
    assert.equal(savedBorderRadius(500, 'round'), 100);
  });
});
