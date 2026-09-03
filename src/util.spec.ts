import { describe, it } from 'vitest';
import { expect } from 'chai';
import { getLatestPrereleaseVersion, getRequiredLookup, resolveTargetDependencyVersion } from './util';

describe('getLatestPrereleaseVersion', () => {
    const rokuDeployVersions = [
        '3.18.3', '3.18.4', '4.0.0-alpha.0', '4.0.0-alpha.1', '4.0.0-alpha.2',
        '4.0.0-alpha.3', '4.0.0-alpha.4', '4.0.0-alpha.5'
    ];

    it('finds the newest version on the same prerelease line', () => {
        expect(getLatestPrereleaseVersion('4.0.0-alpha.2', rokuDeployVersions)).to.eql('4.0.0-alpha.5');
    });

    it('returns undefined when nothing newer exists on the line', () => {
        expect(getLatestPrereleaseVersion('4.0.0-alpha.5', rokuDeployVersions)).to.be.undefined;
    });

    it('returns undefined for a stable version', () => {
        expect(getLatestPrereleaseVersion('3.18.3', rokuDeployVersions)).to.be.undefined;
    });

    it('ignores a different prerelease identifier', () => {
        expect(getLatestPrereleaseVersion('4.0.0-alpha.1', ['4.0.0-beta.0', '4.0.0-beta.1'])).to.be.undefined;
    });

    it('ignores a different major.minor.patch', () => {
        expect(getLatestPrereleaseVersion('4.0.0-alpha.1', ['4.1.0-alpha.9'])).to.be.undefined;
    });
});

describe('getRequiredLookup', () => {
    it('needs nothing when neither side is a prerelease', () => {
        expect(getRequiredLookup('0.24.2', '3.18.3')).to.eql({ kind: 'none' });
    });

    it('needs nothing when the current dependency version is not a version', () => {
        expect(getRequiredLookup('0.24.2', 'abc1234')).to.eql({ kind: 'none' });
        expect(getRequiredLookup('0.24.2', undefined)).to.eql({ kind: 'none' });
    });

    it('needs nothing when a prerelease project depends on a stable dependency', () => {
        expect(getRequiredLookup('1.2.3-alpha.1', '3.18.3')).to.eql({ kind: 'none' });
    });

    it('needs only an existence check for a lockstep bump', () => {
        //this is a yes/no about one immutable version, so it may be answered from cache
        expect(getRequiredLookup('1.2.3-alpha.1', '9.9.9-alpha.1')).to.eql({
            kind: 'exists',
            lockstepVersion: '9.9.9-alpha.2'
        });
    });

    it('needs a live list when the dependency is on an unlocked prerelease line', () => {
        //"newest on this line" changes the moment something is published, so this can never come from cache
        expect(getRequiredLookup('0.24.2', '4.0.0-alpha.5')).to.eql({ kind: 'list' });
    });

    it('needs a live list when a prerelease project is on a non-matching prerelease line', () => {
        expect(getRequiredLookup('1.2.3-alpha.1', '4.0.0-alpha.4')).to.eql({ kind: 'list' });
    });

    it('never asks for a cacheable lookup where the resolver would consult the full list', () => {
        //guards the drift the two-function split could introduce: anything the resolver answers via
        //getLatestPrereleaseVersion must be reported as 'list', never 'exists'
        const pairs: Array<[string, string]> = [
            ['0.24.2', '4.0.0-alpha.5'],
            ['1.2.3-alpha.1', '4.0.0-alpha.4'],
            ['1.2.3-beta.2', '4.0.0-alpha.1']
        ];
        for (const [projectVersion, dependencyVersion] of pairs) {
            expect(getRequiredLookup(projectVersion, dependencyVersion).kind, `${projectVersion} -> ${dependencyVersion}`).to.eql('list');
        }
    });
});

describe('resolveTargetDependencyVersion', () => {
    it('takes the lockstep bump when told the version exists', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '1.2.3-alpha.1',
            currentDependencyVersion: '9.9.9-alpha.1',
            latestDependencyVersion: '9.9.9',
            lockstepVersionExists: true
        })).to.eql('9.9.9-alpha.2');
    });

    it('stays put when told the lockstep version does not exist', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '1.2.3-alpha.1',
            currentDependencyVersion: '9.9.9-alpha.1',
            latestDependencyVersion: '9.9.9',
            lockstepVersionExists: false
        })).to.eql('9.9.9-alpha.1');
    });

    it('takes `latest` when neither the project nor the dependency is a prerelease', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '0.24.2',
            currentDependencyVersion: '3.18.3',
            latestDependencyVersion: '3.18.4'
        })).to.eql('3.18.4');
    });

    it('moves in lockstep when the project and dependency share a prerelease suffix', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '1.2.3-alpha.1',
            currentDependencyVersion: '9.9.9-alpha.1',
            latestDependencyVersion: '9.9.9',
            availableDependencyVersions: ['9.9.9-alpha.1', '9.9.9-alpha.2', '9.9.9-alpha.3', '9.9.9']
        })).to.eql('9.9.9-alpha.2');
    });

    it('stays put in lockstep when the next lockstep version is not published yet', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '1.2.3-alpha.1',
            currentDependencyVersion: '9.9.9-alpha.1',
            latestDependencyVersion: '9.9.9',
            availableDependencyVersions: ['9.9.9-alpha.1', '9.9.9']
        })).to.eql('9.9.9-alpha.1');
    });

    it('follows the prerelease line when a stable project depends on a prerelease', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '0.24.2',
            currentDependencyVersion: '4.0.0-alpha.3',
            latestDependencyVersion: '3.18.4',
            availableDependencyVersions: ['3.18.4', '4.0.0-alpha.3', '4.0.0-alpha.4', '4.0.0-alpha.5']
        })).to.eql('4.0.0-alpha.5');
    });

    it('does not downgrade a stable project off of its prerelease dependency (the roku-debug bug)', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '0.24.2',
            currentDependencyVersion: '4.0.0-alpha.5',
            latestDependencyVersion: '3.18.4',
            availableDependencyVersions: ['3.18.4', '4.0.0-alpha.5']
        })).to.eql('4.0.0-alpha.5');
    });

    it('does not downgrade when the npm version list is unavailable', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '0.24.2',
            currentDependencyVersion: '4.0.0-alpha.5',
            latestDependencyVersion: '3.18.4'
        })).to.eql('4.0.0-alpha.5');
    });

    it('does not downgrade when `latest` is behind what we already depend on', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '0.24.2',
            currentDependencyVersion: '3.18.4',
            latestDependencyVersion: '3.18.3'
        })).to.eql('3.18.4');
    });

    it('takes `latest` when a prerelease project depends on a stable dependency', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '1.2.3-alpha.1',
            currentDependencyVersion: '3.18.3',
            latestDependencyVersion: '3.18.4'
        })).to.eql('3.18.4');
    });

    it('takes `latest` when a prerelease project depends on a non-matching prerelease line', () => {
        //not lockstep (alpha.1 vs alpha.4), so this falls to the prerelease-line rule
        expect(resolveTargetDependencyVersion({
            projectVersion: '1.2.3-alpha.1',
            currentDependencyVersion: '4.0.0-alpha.4',
            latestDependencyVersion: '3.18.4',
            availableDependencyVersions: ['3.18.4', '4.0.0-alpha.4', '4.0.0-alpha.6']
        })).to.eql('4.0.0-alpha.6');
    });

    it('falls back to `latest` when the current version is unknown', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '0.24.2',
            currentDependencyVersion: undefined,
            latestDependencyVersion: '3.18.4'
        })).to.eql('3.18.4');
    });

    it('falls back to `latest` when the current version is a git sha rather than a version', () => {
        expect(resolveTargetDependencyVersion({
            projectVersion: '0.24.2',
            currentDependencyVersion: 'abc1234',
            latestDependencyVersion: '3.18.4'
        })).to.eql('3.18.4');
    });
});
