import {runProductionIndexNowSubmission} from "@/composition/indexnow/indexnow";

async function main(): Promise<void> {
  if (process.argv.length !== 2) {
    process.stderr.write('{"event":"indexnow.submission.failed","result":"failed","reason":"unexpected_arguments"}\n');
    process.exitCode = 64;
    return;
  }

  const result = await runProductionIndexNowSubmission();
  (result.succeeded ? process.stdout : process.stderr).write(`${result.output}\n`);
  if (!result.succeeded) process.exitCode = 1;
}

await main();
