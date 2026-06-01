// Persistent store for a self-hosted SHIK kernel node.
//
// On a Raspberry Pi / home server this is the agent's "self on disk": the full
// identity state I = ⟨id, K, P, M, H⟩ plus the social graph of peers it has met.
// We use a plain JSON file to keep the footprint tiny and dependency-free; a
// production node would swap in SQLite + an HSM for the private key.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { IdentityState, StateCommitments, genesisIdentity } from '../src/lib/shik-kernel';

export interface PeerRecord {
  shik_id: string;
  key_id: string;
  public_key: string;
  state_commitments: StateCommitments;
  policy_governance_seen: boolean;
  trust_score: number;
  relationship_summary: string;
  encounters: number;
  last_seen: string;
}

export interface DaemonData {
  identity: IdentityState;
  peers: Record<string, PeerRecord>;
}

export async function loadOrCreate(path: string, roles: string[]): Promise<DaemonData> {
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf8')) as DaemonData;
  }
  const identity = await genesisIdentity(roles);
  const data: DaemonData = { identity, peers: {} };
  save(path, data);
  return data;
}

export function save(path: string, data: DaemonData): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
}
