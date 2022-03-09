import {Command, Option, program} from 'commander'
import fs from 'fs'
import {join} from 'path'
import sortObject from 'sort-object-keys'
import * as constants from '../constants'
import requirementsGeneratorPlugins from '../plugins/requirements-generator-plugins'
import testCaseMarkupPlugins from '../plugins/test-case-markup-plugins'
import type Plugins from '../plugins/__types__/Plugins'
import loadRequirements from '../requirements/utils/load-requirements'
import generateTestCases from '../test-cases/generator/generate-test-cases'
import loadConfig from '../test-cases/utils/load-config'
import loadTestCases from '../test-cases/utils/load-test-cases'
import printTestCases from '../test-cases/utils/print-test-cases'
import saveTestCases, {
  getTestCaseSaveFileName,
} from '../test-cases/utils/save-test-cases'
import sortTestCases from '../test-cases/utils/sort-test-cases'
import TestCase from '../test-cases/__types__/TestCase'
import clearDirectory from './clear-directory'
import setupOutputDirectory from './setup-output-directory'

function addRequirementsCommand(cmd: Command, plugins: Plugins) {
  plugins = sortObject(plugins)
  const requirementsCmd = cmd.command('requirements').aliases(['r', 'req'])

  const makeCmd = requirementsCmd.command('make').aliases(['m', 'mk'])
  makeCmd.command('all').action(() => {
    setupOutputDirectory()
    Object.values(plugins).forEach((fn) => fn())
  })
  Object.entries(plugins).forEach(([name, fn]) => {
    makeCmd.addCommand(
      new Command(name).action(async () => {
        setupOutputDirectory()
        fn()
      }),
    )
  })

  requirementsCmd
    .command('list-plugins')
    .aliases(['l', 'ls', 'lp'])
    .action(() => {
      console.log('Available plugins to generate requirements files:')
      Object.keys(plugins).map((plugin) => {
        console.log(`  * ${plugin}`)
      })
    })
}

function addTestCasesCommand(cmd: Command) {
  const testCasesCmd = cmd.command('test-cases').aliases(['t', 'tc', 'tests'])

  testCasesCmd
    .command('make')
    .aliases(['m', 'mk'])
    .option('-d, --dry-run', 'Dry run', false)
    .action((options) => {
      const isDryRun = options.dryRun as boolean
      const requirements = loadRequirements(constants.outputRequirementsPath)
      const {sets, generation} = loadConfig(constants.configPath)
      const testCaseSet = new Set<TestCase>()
      sets.forEach((set) => {
        const {filters, dimensions} = set
        generateTestCases({
          requirements,
          dimensions,
          filters,
          generation,
        }).forEach(testCaseSet.add, testCaseSet)
      })
      const testCases = Array.from(testCaseSet).sort(sortTestCases)
      if (isDryRun) {
        const message = printTestCases(testCases)
        console.log(message)
      } else {
        clearDirectory(constants.outputTestCasePath)
        saveTestCases(testCases, constants.outputTestCasePath)
      }
    })

  testCasesCmd
    .command('markup-preview')
    .aliases(['mup', 'markup'])
    .addOption(
      new Option('--format <ext>', 'the file format to markup to')
        .choices(Object.keys(testCaseMarkupPlugins))
        .default('md'),
    )
    .option('-d, --dry-run', 'Dry run', false)
    .action((options) => {
      const markupFn = testCaseMarkupPlugins[options.format]
      const isDryRun = options.dryRun as boolean
      if (!isDryRun) {
        clearDirectory(constants.outputTestCaseRenderPath)
      }
      const testCases = loadTestCases(constants.outputTestCasePath)
      testCases.forEach(async (testCase) => {
        const text = await markupFn(testCase)
        if (isDryRun) {
          console.log(text)
        } else {
          const fileName = getTestCaseSaveFileName(testCase)
          fs.writeFileSync(
            join(
              constants.outputTestCaseRenderPath,
              `${fileName}.${options.format}`,
            ),
            text,
          )
        }
      })
    })
}
program
  .command('clear')
  .description(`Removes the generated directory '${constants.outputPath}'`)
  .action(() => {
    fs.rmSync(constants.outputPath, {recursive: true})
  })

const version = '1.0.0'
program
  .nameFromFilename(__filename)
  .version(version)
  .showHelpAfterError('(add --help for additional information)')
  .showSuggestionAfterError(true)
  .allowExcessArguments(false)

addRequirementsCommand(program, requirementsGeneratorPlugins)
addTestCasesCommand(program)

program.command('upload')

program.parse(process.argv)
