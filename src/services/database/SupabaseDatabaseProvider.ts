// =========================================
// SUPABASE DATABASE PROVIDER
// Uses Supabase PostgreSQL + REST API
// Can be replaced with MongoDB, MySQL, Firebase, etc.
// =========================================

import { DatabaseProvider, DatabaseConfig } from '../interfaces';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export class SupabaseDatabaseProvider implements DatabaseProvider {
  private client: SupabaseClient | null = null;
  private kvTableName = 'kv_store_ae2bff40';

  async initialize(config: DatabaseConfig): Promise<void> {
    if (!config.connectionString || !config.apiKey) {
      throw new Error('Supabase requires connectionString (URL) and apiKey');
    }

    this.client = createClient(config.connectionString, config.apiKey);
  }

  async get(key: string): Promise<any> {
    if (!this.client) throw new Error('Database not initialized');

    const { data, error } = await this.client
      .from(this.kvTableName)
      .select('value')
      .eq('key', key)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get key ${key}: ${error.message}`);
    }

    return data?.value;
  }

  async set(key: string, value: any): Promise<void> {
    if (!this.client) throw new Error('Database not initialized');

    const { error } = await this.client
      .from(this.kvTableName)
      .upsert({ key, value }, { onConflict: 'key' });

    if (error) {
      throw new Error(`Failed to set key ${key}: ${error.message}`);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) throw new Error('Database not initialized');

    const { error } = await this.client
      .from(this.kvTableName)
      .delete()
      .eq('key', key);

    if (error) {
      throw new Error(`Failed to delete key ${key}: ${error.message}`);
    }
  }

  async getMultiple(keys: string[]): Promise<any[]> {
    if (!this.client) throw new Error('Database not initialized');

    const { data, error } = await this.client
      .from(this.kvTableName)
      .select('key, value')
      .in('key', keys);

    if (error) {
      throw new Error(`Failed to get multiple keys: ${error.message}`);
    }

    return data?.map(row => row.value) || [];
  }

  async getByPrefix(prefix: string): Promise<any[]> {
    if (!this.client) throw new Error('Database not initialized');

    const { data, error } = await this.client
      .from(this.kvTableName)
      .select('value')
      .like('key', `${prefix}%`);

    if (error) {
      throw new Error(`Failed to get by prefix ${prefix}: ${error.message}`);
    }

    return data?.map(row => row.value) || [];
  }

  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.client) throw new Error('Database not initialized');

    // Supabase doesn't support direct SQL queries from client
    // This would need to be called via edge function
    throw new Error('Direct SQL queries not supported in Supabase client. Use edge functions.');
  }

  getProviderName(): string {
    return 'Supabase PostgreSQL';
  }
}
