import { Server } from '@prisma/client';
import { ServerRepository } from '../repositories/server.repo';

export class ServerService {
  constructor(private repo: ServerRepository = new ServerRepository()) {}

  async getServers(): Promise<Server[]> {
    return this.repo.findAll();
  }

  async getServer(slug: string): Promise<Server | null> {
    return this.repo.findBySlug(slug);
  }

  async createServer(input: {
    name: string;
    description?: string;
    iconUrl?: string;
    isPublic?: boolean;
    ownerId: string;
  }): Promise<Server> {
    const slug = await this.generateUniqueSlug(input.name);
    return this.repo.create({ ...input, slug });
  }

  async updateServer(
    id: string,
    actorId: string,
    data: { name?: string; description?: string; iconUrl?: string; isPublic?: boolean },
  ): Promise<Server> {
    const server = await this.repo.findById(id);
    if (!server) throw new Error('Server not found');
    if (server.ownerId !== actorId) throw new Error('Only the server owner can update');

    const updateData: typeof data & { slug?: string } = { ...data };
    if (data.name && data.name !== server.name) {
      updateData.slug = await this.generateUniqueSlug(data.name);
    }
    return this.repo.update(id, updateData);
  }

  async deleteServer(id: string, actorId: string): Promise<Server> {
    const server = await this.repo.findById(id);
    if (!server) throw new Error('Server not found');
    if (server.ownerId !== actorId) throw new Error('Only the server owner can delete');
    return this.repo.delete(id);
  }

  generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = this.generateSlug(name);
    if (!base) throw new Error('Cannot generate slug from name');

    let candidate = base;
    let suffix = 1;
    while (await this.repo.slugExists(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix++;
    }
    return candidate;
  }
}
