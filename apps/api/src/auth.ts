import { betterAuth } from 'better-auth';
import { createAccessControl, organization } from 'better-auth/plugins';
import { pool } from './db/pool.js';
import { config } from './config.js';
import { seedDefaultEnvironments } from './hooks/org-created.js';

const statement = {
  organization: ['update', 'delete'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  team: ['create', 'update', 'delete'],
  ac: ['create', 'read', 'update', 'delete'],
  // Custom resources for feature flags:
  featureFlag: ['create', 'read', 'update', 'delete', 'toggle'],
} as const;

// 2. Create the access control instance
const ac = createAccessControl(statement);

const memberRole = ac.newRole({
  featureFlag: ['read', 'toggle'],
})

const adminRole = ac.newRole({
  organization: ['update'],
  member: ['create', 'update', 'delete'],
  invitation: ['create', 'cancel'],
  featureFlag: ['create', 'read', 'update', 'delete', 'toggle'],
})

export const auth = betterAuth({
  database: pool,
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      // Custom roles matching our RBAC model
      ac: ac,
      roles: {
        member: memberRole,
        admin: adminRole,
      },
      organizationHooks: {
        afterCreateOrganization: async ({ organization }) => {
          await seedDefaultEnvironments(organization.id);
        }
      }
    }),
  ],
});
