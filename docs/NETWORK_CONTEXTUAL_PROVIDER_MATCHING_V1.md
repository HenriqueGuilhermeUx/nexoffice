# Network Contextual Provider Matching V1

## Goal

Help a NexOffice workspace discover compatible published providers from an explicit need and safe workspace-local business signals without creating a provider ranking.

## Matching inputs

- optional explicit need summary;
- optional category;
- workspace vertical;
- recurring fiscal attention;
- stale proposal volume;
- active technology/custom-build tasks;
- active legal/compliance tasks.

## Candidate eligibility

A provider must have:

- active NexOffice workspace;
- published provider profile;
- at least one active service;
- different workspace from the requester.

## Explainability

The matcher detects need facets and returns concrete reasons such as profile/service relevance and observed NexOffice capability evidence. Capability evidence is never treated as a quality judgment.

## Neutral ordering

Provider results are displayed alphabetically. There is no provider score, star rating, best-provider flag, weighted ordering or automated provider selection. The customer makes the final choice.

## Privacy

The matcher does not expose or read client identities, private outcome metrics, amounts, Pix secrets, raw documents or fiscal payloads. No delegated access or workspace membership is created by matching.

## External effects

None. Matching is discovery-only and always returns `externalEffect:false`.
