module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
  plugins: [
    // Jest runs CommonJS, where `import.meta` is a syntax error. Vite replaces
    // `import.meta.env.*` at build time; stub it as an empty object for tests.
    ({ types: t }) => ({
      visitor: {
        MetaProperty(path) {
          if (t.isIdentifier(path.node.meta, { name: 'import' })) {
            const member = path.parentPath;
            if (
              member.isMemberExpression() &&
              !member.node.computed &&
              t.isIdentifier(member.node.property, { name: 'env' })
            ) {
              // `import.meta.env.X` → `({}).X` (yields undefined for any var)
              member.replaceWith(t.objectExpression([]));
            } else {
              path.replaceWith(t.objectExpression([]));
            }
          }
        },
      },
    }),
  ],
};
