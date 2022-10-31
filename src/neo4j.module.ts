import { Module, DynamicModule, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Neo4jExcelService } from './neo4j.service';
import { Neo4jConfig } from './interfaces/neo4j-config.interface';
import { NEO4J_OPTIONS, NEO4J_DRIVER } from './neo4j.constants';
import { createDriver } from './neo4j.utils';
import { Neo4jTransactionInterceptor } from './interceptors/neo4j-transaction.interceptor';
import { Neo4jTypeInterceptor } from './interceptors/neo4j-type.interceptor';

@Module({})
export class Neo4jExcelModule {

    static forRoot(config: Neo4jConfig): DynamicModule {
        return {
            module: Neo4jExcelModule,
            global: true,
            providers: [
                {
                    provide: NEO4J_OPTIONS,
                    useValue: config,
                },
                {
                    provide: NEO4J_DRIVER,
                    inject: [ NEO4J_OPTIONS ],
                    useFactory: async (config: Neo4jConfig) => createDriver(config),
                },
                Neo4jExcelService,
            ],
            exports: [
                Neo4jExcelService,
            ]
        }
    }

    static forRootAsync(configProvider: any): DynamicModule {
        return {
            module: Neo4jExcelModule,
            global: true,
            imports: [
                ConfigModule,
            ],

            providers: [
                {
                    provide: NEO4J_OPTIONS,
                    ...configProvider
                } as Provider<any>,
                {
                    provide: NEO4J_DRIVER,
                    inject: [ NEO4J_OPTIONS ],
                    useFactory: async (config: Neo4jConfig) => createDriver(config),
                },
                Neo4jExcelService,
            ],
            exports: [
                Neo4jExcelService,
            ]
        }
    }

    static fromEnv(): DynamicModule {
        return {
            module: Neo4jExcelModule,
            global: true,
            imports: [
                ConfigModule,
            ],
            providers: [
                {
                    provide: NEO4J_OPTIONS,
                    inject: [ ConfigService ],
                    useFactory: (configService: ConfigService) : Neo4jConfig => ({
                        scheme: configService.get('NEO4J_SCHEME'),
                        host: configService.get('NEO4J_HOST'),
                        port: configService.get('NEO4J_PORT'),
                        username: configService.get('NEO4J_USERNAME'),
                        password: configService.get('NEO4J_PASSWORD'),
                        database: configService.get('NEO4J_DATABASE'),
                    })
                } as Provider<any>,
                {
                    provide: NEO4J_DRIVER,
                    inject: [ NEO4J_OPTIONS ],
                    useFactory: async (config: Neo4jConfig) => createDriver(config),
                },
                Neo4jExcelService,
            ],
            exports: [
                Neo4jExcelService,
            ]
        }
    }

}
