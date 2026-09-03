import { describe, it } from 'vitest';
import { expect } from 'chai';
import { getLatestPrereleaseVersion, resolveTargetDependencyVersion } from './util';

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

describe('resolveTargetDependencyVersion', () => {
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
