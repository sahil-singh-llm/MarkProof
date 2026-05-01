export const IPC_CHANNELS = {
  app: {
    getInfo: 'app:get-info'
  },
  cases: {
    list: 'cases:list',
    get: 'cases:get',
    create: 'cases:create',
    update: 'cases:update',
    delete: 'cases:delete'
  },
  evidence: {
    chooseAndImport: 'evidence:choose-and-import',
    listByCase: 'evidence:list-by-case',
    update: 'evidence:update',
    delete: 'evidence:delete'
  }
} as const;
