import { describe, expect, it } from 'vitest';

import { errorsOf, runCheck } from '../../testing';
import { siblingRequired } from './sibling-required.primitive';

const TREE = {
  'src/a.ts': 'export {};\n',
  'src/a.test.ts': 'test\n',
  'src/b.ts': 'export {};\n',
  'src/types.d.ts': 'export {};\n',
};

describe('siblingRequired — `except`', () => {
  // Over every source file, the tests themselves were subjects: `a.test.ts` required an
  // `a.test.test.ts`, and a rule a whole repository follows read as 50%.
  it('leaves the excepted files out of the subjects', async () => {
    const check = siblingRequired({
      id: 'has-test',
      files: 'src/**/*.ts',
      require: '{name}.test.ts',
      except: ['**/*.test.ts', '**/*.d.ts'],
    });
    expect(errorsOf(await runCheck(check, { tree: TREE }))).toEqual([
      'src/b.ts requires a sibling src/b.test.ts, which is missing.',
    ]);
  });

  it('refuses a run where `except` exempted every subject, naming it', async () => {
    const check = siblingRequired({
      id: 'x',
      files: 'src/**/*.test.ts',
      require: '{name}.snap',
      except: ['**/*.ts'],
    });
    expect(errorsOf(await runCheck(check, { tree: TREE }))[0]).toContain('and `except` exempted all of them');
  });

  it('is an option checked by name', () => {
    expect(() =>
      siblingRequired({ id: 'x', files: 's', require: 'r', except: '**/*.test.ts' as unknown as string[] }),
    ).toThrow(/`except` must be/);
  });
});
