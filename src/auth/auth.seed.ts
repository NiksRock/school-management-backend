export interface SeedPermissionDefinition {
  action: string;
  resource: string;
}

export interface SeedFrontendRouteDefinition {
  key: string;
  path: string;
  label: string;
  description: string;
  category: string;
  sortOrder: number;
}

export interface SeedRoleDefinition {
  code: string;
  name: string;
  level: number;
  permissions: SeedPermissionDefinition[];
  frontendRouteKeys: string[];
}

export const DEFAULT_FRONTEND_ROUTE_DEFINITIONS: SeedFrontendRouteDefinition[] =
  [
    {
      key: 'dashboard',
      path: '/dashboard',
      label: 'Dashboard',
      description: 'Main dashboard landing page',
      category: 'core',
      sortOrder: 10,
    },
    {
      key: 'profile',
      path: '/profile',
      label: 'Profile',
      description: 'Personal profile and account settings',
      category: 'core',
      sortOrder: 20,
    },
    {
      key: 'admin.users',
      path: '/admin/users',
      label: 'User Management',
      description: 'Manage users, staff, and account provisioning',
      category: 'admin',
      sortOrder: 30,
    },
    {
      key: 'admin.roles',
      path: '/admin/roles',
      label: 'Role Management',
      description: 'Manage roles, permissions, and route grants',
      category: 'admin',
      sortOrder: 40,
    },
    {
      key: 'principal.overview',
      path: '/principal/overview',
      label: 'Principal Overview',
      description: 'Principal operational dashboard',
      category: 'principal',
      sortOrder: 50,
    },
    {
      key: 'principal.staff',
      path: '/principal/staff',
      label: 'Staff Directory',
      description: 'Review and manage teachers and school staff',
      category: 'principal',
      sortOrder: 60,
    },
    {
      key: 'students.directory',
      path: '/students',
      label: 'Students',
      description: 'Students directory and basic management views',
      category: 'academic',
      sortOrder: 70,
    },
    {
      key: 'teacher.classroom',
      path: '/teacher/classroom',
      label: 'Classroom',
      description: 'Teacher classroom dashboard and class controls',
      category: 'teacher',
      sortOrder: 80,
    },
    {
      key: 'teacher.attendance',
      path: '/teacher/attendance',
      label: 'Attendance',
      description: 'Teacher attendance and student presence workflow',
      category: 'teacher',
      sortOrder: 90,
    },
    {
      key: 'student.portal',
      path: '/student/portal',
      label: 'Student Portal',
      description: 'Student academic and account portal',
      category: 'student',
      sortOrder: 100,
    },
    {
      key: 'student.attendance',
      path: '/student/attendance',
      label: 'My Attendance',
      description: 'Student attendance history and summaries',
      category: 'student',
      sortOrder: 110,
    },
  ];

export const DEFAULT_ROLE_DEFINITIONS: SeedRoleDefinition[] = [
  {
    code: 'SYSTEM_ADMIN',
    name: 'System Admin',
    level: 100,
    permissions: [
      { action: 'CREATE', resource: 'users' },
      { action: 'DELETE', resource: 'users' },
      { action: 'ASSIGN', resource: 'roles' },
      { action: 'READ', resource: '*' },
    ],
    frontendRouteKeys: DEFAULT_FRONTEND_ROUTE_DEFINITIONS.map(
      (route) => route.key,
    ),
  },
  {
    code: 'PRINCIPAL',
    name: 'Principal',
    level: 80,
    permissions: [
      { action: 'CREATE', resource: 'teachers' },
      { action: 'ASSIGN', resource: 'roles' },
      { action: 'READ', resource: '*' },
    ],
    frontendRouteKeys: [
      'dashboard',
      'profile',
      'principal.overview',
      'principal.staff',
      'students.directory',
    ],
  },
  {
    code: 'CLASS_TEACHER',
    name: 'Class Teacher',
    level: 60,
    permissions: [
      { action: 'CREATE', resource: 'students' },
      { action: 'READ', resource: 'students' },
      { action: 'READ', resource: 'attendance' },
    ],
    frontendRouteKeys: [
      'dashboard',
      'profile',
      'students.directory',
      'teacher.classroom',
      'teacher.attendance',
    ],
  },
  {
    code: 'STUDENT',
    name: 'Student',
    level: 20,
    permissions: [{ action: 'READ', resource: 'self' }],
    frontendRouteKeys: [
      'dashboard',
      'profile',
      'student.portal',
      'student.attendance',
    ],
  },
];
