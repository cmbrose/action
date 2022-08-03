import * as fs from 'fs';
import * as core from '@actions/core';
import * as path from 'path';
import { getGitHubMetadata } from './utils';

const FEATURES_README_TEMPLATE = `
# #{Name}

#{Description}

## Example Usage

\`\`\`json
"features": {
        "#{Nwo}/#{Id}@#{VersionTag}": {
            "version": "latest"
        }
}
\`\`\`

## Options

#{OptionsTable}

---

_Note: This file was auto-generated from the [devcontainer-feature.json](#{RepoUrl})._
`;

const TEMPLATE_README_TEMPLATE = `
# #{Name}

#{Description}

## Options

#{OptionsTable}
`;

export async function generateFeaturesDocumentation(basePath: string) {
    await _generateDocumentation(basePath, FEATURES_README_TEMPLATE, 'devcontainer-feature.json');
}

export async function generateTemplateDocumentation(basePath: string) {
    await _generateDocumentation(basePath, TEMPLATE_README_TEMPLATE, 'devcontainer-template.json');
}

async function _generateDocumentation(basePath: string, readmeTemplate: string, metadataFile: string) {
    const directories = fs.readdirSync(basePath);

    await Promise.all(
        directories.map(async (f: string) => {
            if (!f.startsWith('.')) {
                const readmePath = path.join(basePath, f, 'README.md');

                // Reads in feature.json
                const jsonPath = path.join(basePath, f, metadataFile);

                if (!fs.existsSync(jsonPath)) {
                    core.error(`${metadataFile} not found at path '${jsonPath}'`);
                    return;
                }

                let parsedJson: any | undefined = undefined;
                try {
                    parsedJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                } catch (err) {
                    core.error(`Failed to parse ${jsonPath}: ${err}`);
                    return;
                }

                if (!parsedJson || !parsedJson?.id) {
                    core.error(`${metadataFile} for '${f}' does not contain an 'id'`);
                    return;
                }

                const srcInfo = getGitHubMetadata();

                const ref = srcInfo.ref;
                const owner = srcInfo.owner;
                const repo = srcInfo.repo;

                // Add tag if parseable
                let versionTag = 'latest';
                if (ref && ref.includes('refs/tags/')) {
                    versionTag = ref.replace('refs/tags/', '');
                }

                const generateOptionsMarkdown = () => {
                    const options = parsedJson?.options;
                    if (!options) {
                        return '';
                    }

                    const keys = Object.keys(options);
                    const contents = keys
                        .map(k => {
                            const val = options[k];
                            return `| ${k} | ${val.description || '-'} | ${val.type || '-'} | ${val.default || '-'} |`;
                        })
                        .join('\n');

                    return '| Options Id | Description | Type | Default Value |\n' + '|-----|-----|-----|-----|\n' + contents;
                };

                let urlToConfig = './devcontainer-feature.json';
                const basePathTrimmed = basePath.startsWith('./') ? basePath.substring(2) : basePath;
                if (srcInfo.owner && srcInfo.repo) {
                    urlToConfig = `https://github.com/${srcInfo.owner}/${srcInfo.repo}/blob/main/${basePathTrimmed}/${f}/devcontainer-feature.json`;
                }

                const newReadme = readmeTemplate
                    // Templates & Features
                    .replace('#{Id}', parsedJson.id)
                    .replace('#{Name}', parsedJson.name ? `${parsedJson.name} (${parsedJson.id})` : `${parsedJson.id}`)
                    .replace('#{Description}', parsedJson.description ?? '')
                    .replace('#{OptionsTable}', generateOptionsMarkdown())
                    // Features Only
                    .replace('#{Nwo}', `${owner}/${repo}`)
                    .replace('#{VersionTag}', versionTag)
                    // Templates Only
                    .replace('#{ManifestName}', parsedJson?.image?.manifest ?? '')
                    .replace('#{RepoUrl}', urlToConfig);

                // Remove previous readme
                if (fs.existsSync(readmePath)) {
                    fs.unlinkSync(readmePath);
                }

                // Write new readme
                fs.writeFileSync(readmePath, newReadme);
            }
        })
    );
}
