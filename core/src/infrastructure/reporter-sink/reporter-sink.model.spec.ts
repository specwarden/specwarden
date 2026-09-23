import { afterEach, describe, expect, it, vi } from 'vitest';

import { stdoutSink } from './reporter-sink.model';

describe('stdoutSink', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The reporter is the engine's single console writer, and this is its pen. It must
   * write the text as given — no added newline, no buffering — because the reporter
   * composes lines out of several writes and owns every character of the frame.
   */
  it('writes exactly the text it was handed to the process stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stdoutSink('▶ a');
    stdoutSink(' — b\n');

    expect(write.mock.calls.map((c) => c[0])).toEqual(['▶ a', ' — b\n']);
  });
});
