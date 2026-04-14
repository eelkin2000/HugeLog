import m0000 from './0000_initial.sql';

export default {
  journal: {
    entries: [
      {
        idx: 0,
        version: '1',
        when: 1712966400000,
        tag: '0000_initial',
      },
    ],
  },
  migrations: {
    '0000_initial': m0000,
  },
};
