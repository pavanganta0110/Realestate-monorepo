import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient, PublishStatus, Role, UserStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const apiUrl = process.env.VERIFY_API_URL || 'http://127.0.0.1:3013/api';
const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !publishableKey || !secretKey) {
  throw new Error('Supabase verification credentials are missing');
}

const prisma = new PrismaClient();
const admin = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storage = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = randomUUID().slice(0, 8);
const password = `Verify-${randomUUID()}!`;
const rentalAdminEmail = `delivered+phase6-admin-${suffix}@resend.dev`;
const tenantEmail = `delivered+phase6-tenant-${suffix}@resend.dev`;
const authUserIds: string[] = [];
const appUserIds: string[] = [];
const storageObjects: Array<{ bucket: string; path: string }> = [];
const resourceIds: string[] = [];
let propertyId: string | undefined;
let unitId: string | undefined;
let tenantId: string | undefined;
let leaseId: string | undefined;
let maintenanceId: string | undefined;

type JsonObject = Record<string, unknown>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as T;
  return { response, body };
}

async function signIn(email: string) {
  const client = createClient(supabaseUrl!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) {
    throw result.error || new Error(`Sign-in failed for ${email}`);
  }
  return { client, token: result.data.session.access_token };
}

async function uploadSignedObject(upload: {
  bucket: string;
  path: string;
  token: string;
}) {
  const onePixelPng = new Blob(
    [
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8S8AAAAASUVORK5CYII=',
        'base64',
      ),
    ],
    { type: 'image/png' },
  );
  const { error } = await storage.storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, onePixelPng, {
      contentType: 'image/png',
    });
  if (error) throw error;
  storageObjects.push({ bucket: upload.bucket, path: upload.path });
}

async function main() {
  const { data: rentalAdminAuth, error: rentalAdminAuthError } =
    await admin.auth.admin.createUser({
      email: rentalAdminEmail,
      password,
      email_confirm: true,
    });
  if (rentalAdminAuthError || !rentalAdminAuth.user) {
    throw rentalAdminAuthError || new Error('Rental Admin auth user failed');
  }
  authUserIds.push(rentalAdminAuth.user.id);
  const rentalAdmin = await prisma.user.create({
    data: {
      authUserId: rentalAdminAuth.user.id,
      email: rentalAdminEmail,
      role: Role.TENANT_ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  appUserIds.push(rentalAdmin.id);
  const adminSession = await signIn(rentalAdminEmail);

  const propertyCreate = await request<{
    id: string;
    publishStatus: PublishStatus;
  }>(
    '/admin/properties',
    {
      method: 'POST',
      body: JSON.stringify({
        name: `Phase 6 Rental ${suffix}`,
        address: '601 Verification Avenue',
        city: 'Kansas City',
        state: 'MO',
        zip: '64108',
        propertyType: 'Apartment',
        description:
          'A production verification rental with transit access and secure entry.',
        rentAmount: 1850,
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1050,
        amenities: ['Secure entry', 'In-unit laundry'],
        utilityInfo: 'Tenant pays electricity; water is included.',
        status: 'active',
      }),
    },
    adminSession.token,
  );
  assert(
    propertyCreate.response.status === 201 &&
      propertyCreate.body.publishStatus === PublishStatus.DRAFT,
    'Rental Admin could not create a private rental draft',
  );
  propertyId = propertyCreate.body.id;
  resourceIds.push(propertyId);

  const hiddenDraft = await request(`/public/rental-properties/${propertyId}`);
  assert(hiddenDraft.response.status === 404, 'Draft rental leaked publicly');

  const rentalUpload = await request<{
    bucket: string;
    path: string;
    token: string;
  }>(
    `/admin/properties/${propertyId}/photo-upload-url`,
    {
      method: 'POST',
      body: JSON.stringify({
        fileName: 'phase6.png',
        contentType: 'image/png',
      }),
    },
    adminSession.token,
  );
  assert(rentalUpload.response.status === 201, 'Rental photo URL failed');
  await uploadSignedObject(rentalUpload.body);
  const rentalAttach = await request<{ photos: string[] }>(
    `/admin/properties/${propertyId}/photos`,
    { method: 'POST', body: JSON.stringify({ path: rentalUpload.body.path }) },
    adminSession.token,
  );
  assert(
    rentalAttach.response.status === 201 &&
      rentalAttach.body.photos.length === 1,
    'Uploaded rental photo was not persisted',
  );

  const unitCreate = await request<{ id: string; status: string }>(
    '/admin/units',
    {
      method: 'POST',
      body: JSON.stringify({
        propertyId,
        unitNumber: '6A',
        floor: '6',
        bedrooms: 2,
        bathrooms: 2,
        squareFeet: 1050,
        rentAmount: 1850,
        depositAmount: 1850,
        status: 'vacant',
        availableDate: '2026-09-01T00:00:00.000Z',
      }),
    },
    adminSession.token,
  );
  assert(
    unitCreate.response.status === 201 && unitCreate.body.status === 'vacant',
    'Rental unit creation failed',
  );
  unitId = unitCreate.body.id;
  resourceIds.push(unitId);

  const duplicateUnit = await request(
    '/admin/units',
    {
      method: 'POST',
      body: JSON.stringify({
        propertyId,
        unitNumber: '6A',
        bedrooms: 1,
        bathrooms: 1,
        squareFeet: 700,
        rentAmount: 1400,
        depositAmount: 1400,
      }),
    },
    adminSession.token,
  );
  assert(
    duplicateUnit.response.status === 409,
    'Duplicate unit number was not rejected',
  );

  const publish = await request<{ publishStatus: PublishStatus }>(
    `/admin/properties/${propertyId}/publish`,
    { method: 'POST', body: JSON.stringify({}) },
    adminSession.token,
  );
  assert(
    publish.response.status === 201 &&
      publish.body.publishStatus === PublishStatus.PUBLISHED,
    'Rental Admin direct publish failed',
  );
  const publicRental = await request<{
    id: string;
    photos: string[];
    units: Array<{ id: string }>;
  }>(`/public/rental-properties/${propertyId}`);
  assert(
    publicRental.response.status === 200 &&
      publicRental.body.id === propertyId &&
      publicRental.body.photos.length === 1 &&
      publicRental.body.units.some(({ id }) => id === unitId),
    'Published rental feed omitted the property, photo, or vacant unit',
  );

  const unpublish = await request<{ publishStatus: PublishStatus }>(
    `/admin/properties/${propertyId}/unpublish`,
    { method: 'POST', body: JSON.stringify({}) },
    adminSession.token,
  );
  assert(
    unpublish.response.status === 201 &&
      unpublish.body.publishStatus === PublishStatus.UNPUBLISHED,
    'Rental unpublish failed',
  );
  const hiddenAfterUnpublish = await request(
    `/public/rental-properties/${propertyId}`,
  );
  assert(
    hiddenAfterUnpublish.response.status === 404,
    'Unpublished rental remained public',
  );
  const republish = await request(
    `/admin/properties/${propertyId}/publish`,
    { method: 'POST', body: JSON.stringify({}) },
    adminSession.token,
  );
  assert(republish.response.status === 201, 'Rental republish failed');

  const invite = await request<{ success: boolean }>(
    '/auth/invite',
    {
      method: 'POST',
      body: JSON.stringify({
        email: tenantEmail,
        firstName: 'Phase Six',
        lastName: 'Tenant',
        unitId,
      }),
    },
    adminSession.token,
  );
  assert(
    invite.response.status === 201 && invite.body.success,
    'Rental Admin tenant invitation failed',
  );
  const tenant = await prisma.tenant.findUnique({
    where: { email: tenantEmail },
    include: { user: true },
  });
  assert(tenant?.user, 'Tenant and portal user were not created together');
  tenantId = tenant.id;
  resourceIds.push(tenantId);
  appUserIds.push(tenant.user.id);
  authUserIds.push(tenant.user.authUserId);
  const { error: tenantPasswordError } = await admin.auth.admin.updateUserById(
    tenant.user.authUserId,
    {
      password,
      email_confirm: true,
    },
  );
  if (tenantPasswordError) throw tenantPasswordError;
  const tenantSession = await signIn(tenantEmail);
  const activateTenant = await request<{ status: UserStatus }>(
    '/auth/me',
    {},
    tenantSession.token,
  );
  assert(
    activateTenant.response.status === 200 &&
      activateTenant.body.status === UserStatus.ACTIVE,
    'Invited tenant did not activate on first authenticated portal access',
  );

  const leaseCreate = await request<{ id: string; status: string }>(
    '/admin/leases',
    {
      method: 'POST',
      body: JSON.stringify({
        tenantId,
        unitId,
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2027-08-31T00:00:00.000Z',
        monthlyRent: 1850,
        rentDueDay: 1,
        gracePeriodDays: 5,
        lateFeeAmount: 75,
        securityDeposit: 1850,
      }),
    },
    adminSession.token,
  );
  assert(
    leaseCreate.response.status === 201 && leaseCreate.body.status === 'active',
    'Lease creation failed',
  );
  leaseId = leaseCreate.body.id;
  resourceIds.push(leaseId);
  const occupiedUnit = await prisma.unit.findUnique({ where: { id: unitId } });
  const activeTenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });
  assert(
    occupiedUnit?.status === 'occupied' &&
      activeTenant?.unitId === unitId &&
      activeTenant.status === 'active',
    'Lease transaction did not synchronize tenant and unit occupancy',
  );
  const duplicateLease = await request(
    '/admin/leases',
    {
      method: 'POST',
      body: JSON.stringify({
        tenantId,
        unitId,
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2027-09-30T00:00:00.000Z',
        monthlyRent: 1850,
        securityDeposit: 1850,
      }),
    },
    adminSession.token,
  );
  assert(
    duplicateLease.response.status === 409,
    'A second active tenant/unit lease was accepted',
  );
  const tenantLease = await request<{ id: string }>(
    '/tenant/portal/lease',
    {},
    tenantSession.token,
  );
  assert(
    tenantLease.response.status === 200 && tenantLease.body.id === leaseId,
    'Tenant portal did not expose the active lease',
  );

  const maintenanceCreate = await request<{ id: string; status: string }>(
    '/tenant/portal/maintenance',
    {
      method: 'POST',
      body: JSON.stringify({
        category: 'plumbing',
        priority: 'high',
        description: 'Water is leaking beneath the kitchen sink cabinet.',
        preferredAccessTimes: 'Weekdays after 4 PM',
      }),
    },
    tenantSession.token,
  );
  assert(
    maintenanceCreate.response.status === 201 &&
      maintenanceCreate.body.status === 'submitted',
    'Tenant maintenance submission failed',
  );
  maintenanceId = maintenanceCreate.body.id;
  resourceIds.push(maintenanceId);
  const maintenanceUpload = await request<{
    bucket: string;
    path: string;
    token: string;
  }>(
    `/tenant/portal/maintenance/${maintenanceId}/photo-upload-url`,
    {
      method: 'POST',
      body: JSON.stringify({ fileName: 'leak.png', contentType: 'image/png' }),
    },
    tenantSession.token,
  );
  assert(
    maintenanceUpload.response.status === 201,
    'Maintenance photo URL failed',
  );
  await uploadSignedObject(maintenanceUpload.body);
  const maintenanceAttach = await request<{ photoUrls: string[] }>(
    `/tenant/portal/maintenance/${maintenanceId}/photos`,
    {
      method: 'POST',
      body: JSON.stringify({ path: maintenanceUpload.body.path }),
    },
    tenantSession.token,
  );
  assert(
    maintenanceAttach.response.status === 201 &&
      maintenanceAttach.body.photoUrls.length === 1,
    'Private maintenance photo was not attached with a signed read URL',
  );
  const adminMaintenance = await request<Array<{ id: string }>>(
    '/admin/maintenance?status=submitted&limit=10',
    {},
    adminSession.token,
  );
  assert(
    adminMaintenance.response.status === 200 &&
      adminMaintenance.body.some(({ id }) => id === maintenanceId),
    'Rental Admin did not receive the maintenance request',
  );
  const completeMaintenance = await request<{ status: string }>(
    `/admin/maintenance/${maintenanceId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'completed',
        cost: 125,
        adminNotes: 'Replaced the sink supply line.',
      }),
    },
    adminSession.token,
  );
  assert(
    completeMaintenance.response.status === 200 &&
      completeMaintenance.body.status === 'completed',
    'Rental Admin could not complete maintenance',
  );
  const confirmMaintenance = await request<{ status: string }>(
    `/tenant/portal/maintenance/${maintenanceId}/confirm`,
    { method: 'PATCH', body: JSON.stringify({}) },
    tenantSession.token,
  );
  assert(
    confirmMaintenance.response.status === 200 &&
      confirmMaintenance.body.status === 'tenant_confirmed',
    'Tenant completion confirmation failed',
  );

  const tenantMessage = await request<{ items: Array<{ id: string }> }>(
    '/tenant/portal/messages',
    {
      method: 'POST',
      body: JSON.stringify({
        subject: 'Lease question',
        body: 'Can you confirm the move-in inspection time?',
      }),
    },
    tenantSession.token,
  );
  assert(
    tenantMessage.response.status === 201 &&
      tenantMessage.body.items.length === 1,
    'Tenant message did not route to Rental Admin',
  );
  const adminInbox = await request<{
    items: Array<{ id: string; unreadCount: number }>;
  }>('/admin/messages?limit=10', {}, adminSession.token);
  assert(
    adminInbox.response.status === 200 &&
      adminInbox.body.items.some(
        (thread) => thread.id === tenantId && thread.unreadCount === 1,
      ),
    'Shared Rental Admin inbox did not show the unread tenant message',
  );
  const firstAdminRead = await request<{ markedRead: number }>(
    `/admin/messages/${tenantId}/read`,
    { method: 'POST', body: JSON.stringify({}) },
    adminSession.token,
  );
  const secondAdminRead = await request<{ markedRead: number }>(
    `/admin/messages/${tenantId}/read`,
    { method: 'POST', body: JSON.stringify({}) },
    adminSession.token,
  );
  assert(
    firstAdminRead.body.markedRead === 1 &&
      secondAdminRead.body.markedRead === 0,
    'Admin read operation was not idempotent',
  );
  const adminReply = await request<{
    items: Array<{ senderId: string; readAt: string | null }>;
  }>(
    `/admin/messages/${tenantId}`,
    {
      method: 'POST',
      body: JSON.stringify({
        subject: 'Move-in inspection',
        body: 'Your move-in inspection is confirmed for 3 PM.',
      }),
    },
    adminSession.token,
  );
  assert(
    adminReply.response.status === 201 && adminReply.body.items.length === 2,
    'Rental Admin reply failed',
  );
  const tenantThreadPage = await request<{
    items: Array<{ id: string }>;
    nextCursor: string | null;
  }>('/tenant/portal/messages?limit=1', {}, tenantSession.token);
  assert(
    tenantThreadPage.response.status === 200 &&
      tenantThreadPage.body.items.length === 1 &&
      Boolean(tenantThreadPage.body.nextCursor),
    'Tenant message cursor pagination did not bound the thread',
  );
  const tenantRead = await request<{ markedRead: number }>(
    '/tenant/portal/messages/read',
    { method: 'POST', body: JSON.stringify({}) },
    tenantSession.token,
  );
  assert(
    tenantRead.body.markedRead === 1,
    'Tenant read receipt was not stored',
  );
  const readMessages = await prisma.message.findMany({
    where: { tenantId },
    select: { senderId: true, receiverId: true, readAt: true },
  });
  assert(
    readMessages.length === 2 && readMessages.every(({ readAt }) => readAt),
    'Both directions did not persist visible read timestamps',
  );

  const tenantAdminDenied = await request(
    '/admin/properties',
    {},
    tenantSession.token,
  );
  const adminTenantDenied = await request(
    '/tenant/portal/messages',
    {},
    adminSession.token,
  );
  assert(
    tenantAdminDenied.response.status === 403 &&
      adminTenantDenied.response.status === 403,
    'Rental Admin and Tenant role boundaries were not enforced',
  );

  const dashboard = await request<{ metrics: JsonObject }>(
    '/admin/rental-dashboard',
    {},
    adminSession.token,
  );
  assert(
    dashboard.response.status === 200 &&
      Number(dashboard.body.metrics.published) >= 1 &&
      Number(dashboard.body.metrics.occupiedUnits) >= 1,
    'Rental dashboard did not reflect live workflow state',
  );

  const auditRows = await prisma.auditLog.findMany({
    where: {
      OR: [{ userId: { in: appUserIds } }, { resourceId: { in: resourceIds } }],
    },
    select: { action: true },
  });
  const auditCount = (action: string) =>
    auditRows.filter((row) => row.action === action).length;
  for (const action of [
    'RENTAL_PROPERTY_CREATED',
    'RENTAL_PROPERTY_PHOTO_ATTACHED',
    'RENTAL_UNIT_CREATED',
    'RENTAL_PROPERTY_UNPUBLISHED',
    'TENANT_INVITED',
    'RENTAL_LEASE_CREATED',
    'MAINTENANCE_REQUEST_CREATED',
    'MAINTENANCE_PHOTO_ATTACHED',
    'MAINTENANCE_REQUEST_UPDATED',
    'MAINTENANCE_COMPLETION_CONFIRMED',
    'TENANT_MESSAGE_SENT',
    'TENANT_CHAT_SENT',
    'TENANT_MESSAGES_READ',
  ]) {
    assert(auditCount(action) >= 1, `Missing Phase 6 audit event ${action}`);
  }
  assert(
    auditCount('RENTAL_PROPERTY_PUBLISHED') === 2,
    'Publish/republish audit count was not exact',
  );
  assert(
    auditCount('TENANT_ADMIN_MESSAGES_READ') === 1,
    'No-op admin reads emitted duplicate audit events',
  );

  const { error: tenantSignOutError } =
    await tenantSession.client.auth.signOut();
  const { error: adminSignOutError } = await adminSession.client.auth.signOut();
  if (tenantSignOutError || adminSignOutError) {
    throw new Error(
      tenantSignOutError?.message ||
        adminSignOutError?.message ||
        'Phase 6 verification sign-out failed',
    );
  }

  console.log('PHASE_6_RENTAL_WORKFLOW_VERIFIED');
}

main()
  .finally(async () => {
    for (const object of storageObjects) {
      await admin.storage.from(object.bucket).remove([object.path]);
    }
    if (tenantId) {
      await prisma.message.deleteMany({ where: { tenantId } });
      await prisma.maintenanceRequest.deleteMany({ where: { tenantId } });
      await prisma.payment.deleteMany({ where: { tenantId } });
      await prisma.lease.deleteMany({ where: { tenantId } });
    }
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          ...(appUserIds.length > 0 ? [{ userId: { in: appUserIds } }] : []),
          ...(resourceIds.length > 0
            ? [{ resourceId: { in: resourceIds } }]
            : []),
        ],
      },
    });
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    if (unitId) await prisma.unit.deleteMany({ where: { id: unitId } });
    if (propertyId) {
      await prisma.property.deleteMany({ where: { id: propertyId } });
    }
    if (appUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: appUserIds } } });
    }
    for (const authUserId of authUserIds) {
      await admin.auth.admin.deleteUser(authUserId);
    }
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
