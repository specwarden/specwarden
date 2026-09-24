import type { IFileSource, ISpecSource, ISpecSourceResult, ISpecTask } from '../../../domain';
import { parsePlan } from '../../planner/plan-parser/plan-parser.util';

export interface INativeOptions {
  /** Where the plans live. REQUIRED, not defaulted — a plans directory is the
   * consumer's layout choice, and hardcoding one here would both bake a consumer's path
   * into the engine and break the moment a repository puts its plans elsewhere. */
  readonly plansDir: string;
}

/**
 * The native source — specwarden's own plans, wherever the consumer keeps them. A
 * phase is a task, and its acceptance command is the task's proof. This is the
 * source a repository has without a spec-driven tool on top; the ownership map can
 * hand the role to a foreign tool instead, and then `plan status` reads that one
 * through the same port.
 */
export function native(options: INativeOptions): ISpecSource {
  const { plansDir } = options;
  return {
    name: 'native',
    requirements: (): ISpecSourceResult<never> => ({
      found: false,
      items: [],
      note: 'native plans carry tasks with acceptance, not standalone requirements',
    }),
    tasks(files: IFileSource): ISpecSourceResult<ISpecTask> {
      if (!files.exists(plansDir) || !files.isDirectory(plansDir)) {
        return { found: false, items: [], note: `${plansDir} not found` };
      }
      const items: ISpecTask[] = [];
      for (const file of files.list(plansDir)) {
        if (!file.endsWith('.md') || file === 'README.md') continue;
        const { plan } = parsePlan(files.read(`${plansDir}/${file}`));
        plan.phases.forEach((phase, i) => {
          items.push({ id: `${file}#${i + 1}`, title: phase.title, acceptance: phase.acceptance });
        });
      }
      return { found: true, items };
    },
  };
}
