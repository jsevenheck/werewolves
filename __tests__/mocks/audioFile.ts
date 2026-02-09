/**
 * Mock module for audio file imports in Jest tests.
 *
 * When tests import .mp3 files, Jest will return this mock instead.
 * This simulates Vite's asset handling behavior where audio imports
 * resolve to URL strings.
 */

export default 'mock-audio-url.mp3';
