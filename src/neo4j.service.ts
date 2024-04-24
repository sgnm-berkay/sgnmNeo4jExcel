import {
  Injectable,
  Inject,
  OnApplicationShutdown,
  HttpException,
} from "@nestjs/common";
import neo4j, { Driver, Result, int, Transaction } from "neo4j-driver";
import { Neo4jConfig } from "./interfaces/neo4j-config.interface";
import { NEO4J_OPTIONS, NEO4J_DRIVER } from "./neo4j.constants";
import TransactionImpl from "neo4j-driver-core/lib/transaction";

import {
  changeObjectKeyName,
  dynamicFilterPropertiesAdder,
  dynamicFilterPropertiesAdderAndAddParameterKey,
  dynamicLabelAdder,
  filterArrayForEmptyString,
} from "./func/common.func";
import {
  ExportExcelDto,
  ExportExcelDtoForSystem,
  ExportExcelDtoForType,
} from "./dtos/export-import.dtos";
import {
  MainHeaderInterface,
  UserInformationInterface,
} from "./interfaces/header.interface";
import { CustomClassificationError } from "./constant/import-export.error.enum";
import {
  block_already_exist_object,
  building_already_exist_object,
  contact_already_exist_object,
  floor_already_exist_object,
  space_already_exist_object,
  space_has_already_relation_object,
  there_are_no_contacts_object,
  there_are_no_jointSpaces_object,
  there_are_no_spaces_object,
  there_are_no_system_or_component_or_type_object,
  there_are_no_type_or_component_or_type_id_is_wrong_object,
  there_are_no_zones_object,
  there_is_no_type_object,
} from "./constant/import-export.error.object";
import { FilterPropertiesType } from "./constant/filter.properties.type.enum";
const exceljs = require("exceljs");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment");

@Injectable()
export class Neo4jExcelService implements OnApplicationShutdown {
  private readonly driver: Driver;
  private readonly config: Neo4jConfig;
  constructor(
    @Inject(NEO4J_OPTIONS) config: Neo4jConfig,
    @Inject(NEO4J_DRIVER) driver: Driver
  ) {
    this.driver = driver;
    this.config = config;
  }

  getDriver(): Driver {
    return this.driver;
  }

  getConfig(): Neo4jConfig {
    return this.config;
  }

  int(value: number) {
    return int(value);
  }

  beginTransaction(database?: string): Transaction {
    const session = this.getWriteSession(database);

    return session.beginTransaction();
  }

  getReadSession(database?: string) {
    return this.driver.session({
      database: database || this.config.database,
      defaultAccessMode: neo4j.session.READ,
    });
  }

  getWriteSession(database?: string) {
    return this.driver.session({
      database: database || this.config.database,
      defaultAccessMode: neo4j.session.WRITE,
    });
  }

  read(
    cypher: string,
    params?: Record<string, any>,
    databaseOrTransaction?: string | Transaction
  ): Result {
    if (databaseOrTransaction instanceof TransactionImpl) {
      return (<Transaction>databaseOrTransaction).run(cypher, params);
    }
    const session = this.getReadSession(<string>databaseOrTransaction);
    return session.run(cypher, params);
  }

  write(
    cypher: string,
    params?: Record<string, any>,
    databaseOrTransaction?: string | Transaction
  ): Result {
    if (databaseOrTransaction instanceof TransactionImpl) {
      return (<Transaction>databaseOrTransaction).run(cypher, params);
    }

    const session = this.getWriteSession(<string>databaseOrTransaction);
    return session.run(cypher, params);
  }

  onApplicationShutdown() {
    return this.driver.close();
  }

  async findChildrensByLabelsAndFilters(
    root_labels: string[] = [],
    root_filters: object = {},
    children_labels: string[] = [],
    children_filters: object = {},
    relation_name: string,
    relation_filters: object = {},
    relation_depth: number | "" = "",
    databaseOrTransaction?: string | Transaction
  ) {
    try {
      const rootLabelsWithoutEmptyString =
        filterArrayForEmptyString(root_labels);
      const childrenLabelsWithoutEmptyString =
        filterArrayForEmptyString(children_labels);

      const cypher =
        `MATCH p=(n` +
        dynamicLabelAdder(rootLabelsWithoutEmptyString) +
        dynamicFilterPropertiesAdder(root_filters) +
        `-[r:${relation_name}*1..${relation_depth}` +
        dynamicFilterPropertiesAdderAndAddParameterKey(relation_filters,FilterPropertiesType.RELATION,'2') +
        ` ]->(m` +
        dynamicLabelAdder(childrenLabelsWithoutEmptyString) +
        dynamicFilterPropertiesAdderAndAddParameterKey(children_filters) +
        ` RETURN n as parent,m as children,r as relation`;

      children_filters = changeObjectKeyName(children_filters);
      relation_filters = changeObjectKeyName(relation_filters,'2');
      const parameters = { ...root_filters, ...children_filters,...relation_filters};
      const result = await this.read(cypher, parameters, databaseOrTransaction);
      return result["records"];
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error, 500);
      }
    }
  }

  //** ASSET //

  async getTypesExcel(
    res,
    body: ExportExcelDtoForType,
    header: UserInformationInterface
  ) {
    try {
      let data = [];
      const { typeKeys } = body;
      const { username="berko", language, realm } = header;
      for (let key of typeKeys) {
        let newData = await this.getTypesByRealmAndByLanguage(
          realm,
          key,
          language,
          username
        );

        if (newData instanceof Error) {
          throw new HttpException(there_is_no_type_object, 404);
        } else {
          data = [...data, ...newData];
        }
      }

      let workbook = new exceljs.Workbook();
      let worksheet = workbook.addWorksheet("Types");

      worksheet.columns = [
        { header: "Type Name", key: "typeName", width: 50 },
        { header: "Model Name", key: "modelNumber", width: 50 },
        { header: "Super Set", key: "superSet", width: 50 },
        { header: "Description", key: "description", width: 50 },
        {
          header: "Warranty Duration Parts",
          key: "warrantyDurationParts",
          width: 50,
        },
        {
          header: "Warranty Duration Labor",
          key: "warrantyDurationLabor",
          width: 50,
        },
        { header: "Omni Category", key: "omniCategory", width: 50 },
        { header: "Asset Type", key: "assetType", width: 50 },
        { header: "Type Category", key: "typeCategory", width: 50 },
        { header: "Brand", key: "brand", width: 50 },
        { header: "Duration Unit", key: "durationUnit", width: 50 },
        { header: "Warranty Duration Unit", key: "warrantyDurationUnit", width: 50 },
        { header: "Measurement Unit", key: "measurementUnit", width: 50 },
        { header: "Created At", key: "createdAt", width: 50 },
      ];

      worksheet.addRows(data);

      return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getTypesByRealmAndByLanguage(
    realm: string,
    typeKey: string,
    language: string,
    userName: string
  ) {
    try {
      let data: any;
      let jsonData = [];
      let cypher = `WITH 'MATCH (c:Asset {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Types) MATCH path = (b)-[:PARENT_OF {isDeleted:false}]->(m:Type {key:"${typeKey}"})-[:CLASSIFIED_BY| ASSET_TYPE_BY| WARRANTY_DURATION_UNIT_BY | TYPE_CLASSIFIED_BY| BRAND_BY | DURATION_UNIT_BY | MEASUREMENT_UNIT_BY {isDeleted:false}]->(z) where  z.language="${language}" and m.isDeleted=false  and not (m:Component) 
    WITH collect(path) AS paths
    CALL apoc.convert.toTree(paths)
    YIELD value
    RETURN value' AS query
    CALL apoc.export.json.query(query,'/${userName}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`;

      await this.write(cypher);

      //call the file using below code
      let cypher2 = `CALL apoc.load.json("${userName}.json")`;

      let returnData = await this.read(cypher2);
      data = await returnData.records[0]["_fields"][0];

      if (data.length == 0) {
        throw new HttpException(there_is_no_type_object, 404);
      } else {
        
        for (let index = 0; index < data.value.parent_of?.length; index++) {
          let typeProperties = data.value.parent_of[index];
  
          jsonData.push({
            typeName: typeProperties.name,
            modelNumber: typeProperties.modelNumber,
            superSet:typeProperties.superSet,
            description: typeProperties.description,
            warrantyDurationParts: typeProperties.warrantyDurationParts,
            warrantyDurationLabor: typeProperties.warrantyDurationLabor,
            omniCategory: typeProperties.classified_by[0].name,
            assetType: typeProperties.asset_type_by[0].name,
            typeCategory: typeProperties.type_classified_by[0].name,
            brand: typeProperties.brand_by[0].name,
            durationUnit: typeProperties.duration_unit_by[0].name,
            warrantyDurationUnit: typeProperties.warranty_duration_unit_by[0].name,
            measurementUnit: typeProperties.measurement_unit_by[0].name,
            createdAt: typeProperties.createdAt,
          });
        }
  
        return jsonData;
      }

      
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getComponentsExcel(
    res,
    body: ExportExcelDtoForType,
    header: UserInformationInterface
  ) {
    let data = [];
    const { typeKeys } = body;
    const { username="berko", realm } = header;
    try {
      for (let key of typeKeys) {
        let newData = await this.getComponentsOfTypeWithTypekey(
          realm,
          key,
          username
        );

        if (newData instanceof Error) {
          throw new HttpException(
            there_are_no_type_or_component_or_type_id_is_wrong_object,
            404
          );
        } else {
          data = [...data, ...newData];
        }
      }

      let workbook = new exceljs.Workbook();
      let worksheet = workbook.addWorksheet("Components");

      worksheet.columns = [
        { header: "Type Name", key: "typeName", width: 50 },
        { header: "Component Name", key: "componentName", width: 50 },
        { header: "Space Name", key: "spaceName", width: 50 },
        { header: "Description", key: "description", width: 50 },
        { header: "AssetIdentifier", key: "assetIdentifier", width: 50 },
        { header: "Serial No", key: "serialNo", width: 50 },
        {
          header: "Warranty Duration Labor",
          key: "warrantyDurationLabor",
          width: 50,
        },
        {
          header: "Warranty Duration Parts",
          key: "warrantyDurationParts",
          width: 50,
        },
      ];

      worksheet.addRows(data);

      return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getComponentsOfTypeWithTypekey(
    realm: string,
    typeKey: string,
    username: string
  ) {
    try {
      let data: any;
      let jsonData = [];
      let cypher = `WITH 'MATCH (a:Asset {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Types) MATCH path = (b)-[:PARENT_OF {isDeleted:false}]->(t:Type {key:"${typeKey}"})-[:PARENT_OF {isDeleted:false}]->(c:Component)-[:WARRANTY_GUARANTOR_LABOR_BY | WARRANTY_GUARANTOR_PARTS_BY | LOCATED_IN {isDeleted:false}]->(x) where  t.isDeleted=false and c.isDeleted=false
      WITH collect(path) AS paths
      CALL apoc.convert.toTree(paths)
      YIELD value
      RETURN value' AS query
      CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
      YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
      RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`;

      await this.write(cypher);

      //call the file using below code
      let cypher2 = `CALL apoc.load.json("${username}.json")`;

      let returnData = await this.read(cypher2);
      data = await returnData.records[0]["_fields"][0];

      if (data.length == 0) {
        throw new HttpException(
          there_are_no_type_or_component_or_type_id_is_wrong_object,
          404
        );
      } else {
        for (let j = 0; j < data.value.parent_of?.length; j++) {
          // type
          for (let i = 0; i < data.value.parent_of[j].parent_of?.length; i++) {
            // components

            let componentProperties = data.value.parent_of[j].parent_of[i];

            jsonData.push({
              typeName: data.value.parent_of[j].name,
              componentName: componentProperties.name,
              spaceName: componentProperties.located_in[0].name,
              description: componentProperties.description,
              assetIdentifier: componentProperties.assetIdentifier,
              serialNo: componentProperties.serialNo,
              warrantyDurationLabor:
                componentProperties.warrantyDurationLabor,
              warrantyDurationParts:
                componentProperties.warrantyDurationParts,
            });
          }
        }

        return jsonData;
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getSystemsExcel(
    res,
    body: ExportExcelDtoForSystem,
    header: UserInformationInterface
  ) {
    let data = [];
    const { systemKeys } = body;
    const { username, realm } = header;
    try {
      for (let key of systemKeys) {
        let newData = await this.getSystemsByKey(realm, key, username);

        if (newData instanceof Error) {
          throw new HttpException(
            there_are_no_system_or_component_or_type_object,
            404
          );
        } else {
          data = [...data, ...newData];
        }
      }

      let workbook = new exceljs.Workbook();
      let worksheet = workbook.addWorksheet("Systems");

      worksheet.columns = [
        { header: "System Name", key: "systemName", width: 50 },
        { header: "System Description", key: "systemDescription", width: 50 },
        { header: "Type Name", key: "typeName", width: 50 },
        { header: "Component Name", key: "componentName", width: 50 },
        { header: "Space Name", key: "spaceName", width: 50 },
        { header: "Description", key: "description", width: 50 },
        { header: "Serial No", key: "serialNo", width: 50 },
        {
          header: "Warranty Duration Labor",
          key: "warrantyDurationLabor",
          width: 50,
        },
        {
          header: "Warranty Duration Parts",
          key: "warrantyDurationParts",
          width: 50,
        },
      ];

      worksheet.addRows(data);
      return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getSystemsByKey(realm: string, systemKey: string, username: string) {
    try {
      let data: any;
      let jsonData = [];
      let cypher = `WITH 'MATCH (a:Asset {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Systems)-[:PARENT_OF* {isDeleted:false}]->(s:System {key:"${systemKey}",isDeleted:false}) MATCH path = (s)-[:SYSTEM_OF|TYPE_OF_SYSTEM {isDeleted:false}]->(ct) where  ct.isDeleted=false
      WITH collect(path) AS paths
      CALL apoc.convert.toTree(paths)
      YIELD value
      RETURN value' AS query
      CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
      YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
      RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`;

      await this.write(cypher);

      //call the file using below code
      let cypher2 = `CALL apoc.load.json("${username}.json")`;

      let returnData = await this.read(cypher2);
      data = await returnData.records[0]["_fields"][0];

      console.log(data);
      
      if (data.length == 0) {
        throw new HttpException(
          there_are_no_system_or_component_or_type_object,
          404
        );
      } else {
          // system

          if(data.value.system_of?.length>0){
            for (let c = 0; c < data.value.system_of?.length; c++) {
              // components or type
  
              let componentProperties = data.value.system_of[c];
              //let typeProperties = data.value.type_of_system[c];
  
              jsonData.push({
                systemName: data.value.name,
                systemDescription: data.value.description,
                typeName: "",
                componentName: componentProperties.name,
                spaceName: componentProperties.spaceName,
                description: componentProperties.description,
                serialNo: componentProperties.serialNumber,
                warrantyDurationLabor:
                  componentProperties.warrantyDurationLabor.low,
                warrantyDurationParts:
                  componentProperties.warrantyDurationParts.low,
              });
            }
          }
           if(data.value.type_of_system?.length>0){
            for (let c = 0; c < data.value.type_of_system?.length; c++) {
              // components or type
  
              let typeProperties = data.value.type_of_system[c];
  
              jsonData.push({
                systemName: data.value.name,
                systemDescription: data.value.description,
                typeName: typeProperties.name ? typeProperties.name:"",
                componentName: "",
                spaceName: "",
                description: "",
                serialNo: "",
                warrantyDurationLabor:
                  "",
                warrantyDurationParts:
                  "",
              });
            }
          }
         
        

        return jsonData;
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  //! FACILITY //

  async getSpacesByBuilding(
    realm: string,
    username: string,
    buildingKey: string,
    language: string
  ) {
    try {
      let data: any;
      let jsonData = [];
      let buildingType = [];
      let cypher = `WITH 'MATCH (c:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b {key:"${buildingKey}",isDeleted:false}) MATCH path = (b)-[:PARENT_OF* {isDeleted:false}]->(m)-[:CLASSIFIED_BY| CREATED_BY {isDeleted:false}]->(z) where  (z.language="${language}" or not exists(z.language)) and m.isDeleted=false  and not (m:JointSpaces OR m:JointSpace OR m:Zones or m:Zone) 
    WITH collect(path) AS paths
    CALL apoc.convert.toTree(paths)
    YIELD value
    RETURN value' AS query
    CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`;

      await this.write(cypher);

      //call the file using below code
      let cypher2 = `CALL apoc.load.json("${username}.json")`;

      let returnData = await this.read(cypher2);
      data = await returnData.records[0]["_fields"][0];

      if (
        data.value.parent_of == undefined ||
        (data.value.parent_of[0]?.nodeType == "Floor" &&
          typeof data.value.parent_of[0].parent_of == "undefined") ||
        (data.value.parent_of[0]?.nodeType == "Block" &&
          (typeof data.value.parent_of[0].parent_of == "undefined" ||
            typeof data.value.parent_of[0].parent_of[0].parent_of ==
              "undefined"))
      ) {
        throw new HttpException(there_are_no_spaces_object, 404);
      } else {
        if (data.value.parent_of[0]?.parent_of[0]?.parent_of == undefined) {
          for (let index = 0; index < data.value.parent_of?.length; index++) {
            for (
              let i = 0;
              i < data.value.parent_of[index].parent_of?.length;
              i++
            ) {
              buildingType.push({
                1: data.value.nodeType,
                2: data.value.parent_of[index].nodeType,
                3: data.value.parent_of[index].parent_of[i].nodeType,
              });
            }
          }
        } else {
          for (let index = 0; index < data.value.parent_of?.length; index++) {
            for (
              let i = 0;
              i < data.value.parent_of[index].parent_of?.length;
              i++
            ) {
              for (
                let a = 0;
                a < data.value.parent_of[index].parent_of[i].parent_of?.length;
                a++
              ) {
                buildingType.push({
                  1: data.value.nodeType,
                  2: data.value.parent_of[index].nodeType,
                  3: data.value.parent_of[index].parent_of[i].nodeType,
                  4: data.value.parent_of[index].parent_of[i].parent_of[a]
                    .nodeType,
                });
              }
            }
          }
        }

        let typeList = await Object.values(buildingType[0]);

        if (!typeList.includes("Block")) {
          for (let index = 0; index < data.value.parent_of?.length; index++) {
            for (
              let i = 0;
              i < data.value.parent_of[index].parent_of?.length;
              i++
            ) {
              let spaceProperties = data.value.parent_of[index].parent_of[i];
              jsonData.push({
                buildingName: data.value.name,
                blockName: "-",
                floorName: data.value.parent_of[index].name,
                spaceName: spaceProperties.name,
                code: spaceProperties.code ? spaceProperties.code : " ",
                architecturalName: spaceProperties.architecturalName,
                architecturalCode: spaceProperties.architecturalCode
                  ? spaceProperties.architecturalCode
                  : " ",
                category: spaceProperties.classified_by[0].name,
                grossArea: spaceProperties.grossArea.low,
                netArea: spaceProperties.netArea.low,
                usage: spaceProperties.usage ? spaceProperties.usage : " ",
                tag: spaceProperties.tag.toString(),
                roomTag: spaceProperties.roomTag.toString(),
                status: spaceProperties.status ? spaceProperties.status : " ",
                operatorName: spaceProperties.operatorName
                  ? spaceProperties.operatorName
                  : " ",
                operatorCode: spaceProperties.operatorCode
                  ? spaceProperties.operatorCode
                  : " ",
                description: spaceProperties.description,
                usableHeight: spaceProperties.usableHeight.low,
                externalSystem: spaceProperties.externalSystem,
                externalObject: spaceProperties.externalObject,
                externalIdentifier: spaceProperties.externalIdentifier,
                createdAt: spaceProperties.createdAt,
                createdBy: spaceProperties.created_by[0].email,
              });
            }
          }
        } else {
          for (let index = 0; index < data.value.parent_of?.length; index++) {
            for (
              let i = 0;
              i < data.value.parent_of[index]?.parent_of?.length;
              i++
            ) {
              for (
                let a = 0;
                a <
                data.value.parent_of[index]?.parent_of[i]?.parent_of?.length;
                a++
              ) {
                let spaceProperties =
                  data.value.parent_of[index]?.parent_of[i]?.parent_of[a];

                jsonData.push({
                  buildingName: data.value.name,
                  blockName: data.value.parent_of[index].name,
                  floorName: data.value.parent_of[index].parent_of[i].name,
                  spaceName:
                    data.value.parent_of[index].parent_of[i].parent_of[a].name,
                  code: spaceProperties.code ? spaceProperties.code : " ",
                  architecturalName: spaceProperties.architecturalName,
                  architecturalCode: spaceProperties.architecturalCode
                    ? spaceProperties.architecturalCode
                    : " ",
                  category: spaceProperties.classified_by[0].name,
                  grossArea: spaceProperties.grossArea,
                  netArea: spaceProperties.netArea,
                  usage: spaceProperties.usage ? spaceProperties.usage : " ",
                  tag: spaceProperties.tag.toString(),
                  roomTag: spaceProperties.roomTag.toString(),
                  status: spaceProperties.status ? spaceProperties.status : " ",
                  operatorName: spaceProperties.operatorName
                    ? spaceProperties.operatorName
                    : " ",
                  operatorCode: spaceProperties.operatorCode
                    ? spaceProperties.operatorCode
                    : " ",
                  description: spaceProperties.description,
                  usableHeight: spaceProperties.usableHeight,
                  externalSystem: spaceProperties.externalSystem,
                  externalObject: spaceProperties.externalObject,
                  externalIdentifier: spaceProperties.externalIdentifier,
                  createdAt: spaceProperties.createdAt,
                  createdBy: spaceProperties.created_by[0].email,
                });
              }
            }
          }
        }
        return jsonData;
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getJointSpacesByBuilding(
    realm: string,
    username: string,
    buildingKey: string,
    language: string
  ) {
    try {
      let data: any;
      let jsonData = [];
      let cypher = `WITH 'MATCH (c:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b {key:"${buildingKey}",isDeleted:false}) MATCH path = (b)-[:PARENT_OF* {isDeleted:false}]->(m)-[:CLASSIFIED_BY| CREATED_BY {isDeleted:false}]->(z) where  (z.language="${language}" or not exists(z.language)) and m.isDeleted=false  and not (m:Space OR m:Zone OR m:Zones OR m:Floor OR m:Block)
    WITH collect(path) AS paths
    CALL apoc.convert.toTree(paths)
    YIELD value
    RETURN value' AS query
    CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`;

      await this.write(cypher);

      //call the file using below code
      let cypher2 = `CALL apoc.load.json("${username}.json")`;
      let returnData = await this.read(cypher2);
      data = await returnData.records[0]["_fields"][0];

      if (Object.keys(data?.value).length == 0) {
        throw new HttpException(there_are_no_jointSpaces_object(), 404);
      }

      for (let index = 0; index < data.value.parent_of?.length; index++) {
        for (
          let i = 0;
          i < data.value.parent_of[index].parent_of?.length;
          i++
        ) {
          let jointSpaceProperties = data.value.parent_of[index].parent_of[i];

          jsonData.push({
            buildingName: data.value.name,
            jointSpaceName: jointSpaceProperties.name,
            category: jointSpaceProperties.classified_by[0].name,
            spaceNames: jointSpaceProperties.jointSpaceTitle,
            description: jointSpaceProperties.description,
            tags: jointSpaceProperties.tag.toString(),
            roomTags: jointSpaceProperties.roomTag.toString(),
            status: jointSpaceProperties.status
              ? jointSpaceProperties.status
              : " ",
            usage: jointSpaceProperties.usage
              ? jointSpaceProperties.usage
              : " ",
            usableHeight: jointSpaceProperties.usableHeight
              ? jointSpaceProperties.usableHeight
              : " ",
            grossArea: jointSpaceProperties.grossArea
              ? jointSpaceProperties.grossArea
              : " ",
            netArea: jointSpaceProperties.netArea
              ? jointSpaceProperties.netArea
              : " ",
          });
        }
      }

      return jsonData;
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(
          {
            code: CustomClassificationError.DEFAULT_ERROR,
            message: error.message,
          },
          error.status
        );
      }
    }
  }

  async getZonesByBuilding(
    realm: string,
    username: string,
    buildingKey: string,
    language: string
  ) {
    try {
      let data: any;
      let jsonData = [];
      let cypher = `WITH 'MATCH (c:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) MATCH path = (b)-[:PARENT_OF* {isDeleted:false}]->(m)-[:CREATED_BY| CLASSIFIED_BY {isDeleted:false}]->(z) where (z.language="${language}" or not exists(z.language)) and m.isDeleted=false  and not (m:Space OR m:JointSpaces OR m:JointSpace OR m:Floor OR m:Block)
        WITH collect(path) AS paths
        CALL apoc.convert.toTree(paths)
        YIELD value
        RETURN value' AS query
        CALL apoc.export.json.query(query,'/${username}.json',{jsonFormat:'ARRAY_JSON'})
        YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
        RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`;

      await this.write(cypher);

      //call the file using below code
      let cypher2 = `CALL apoc.load.json("${username}.json")`;

      let returnData = await this.read(cypher2);
      data = await returnData.records[0]["_fields"][0];

      if (Object.keys(data?.value).length == 0) {
        throw new HttpException(there_are_no_zones_object, 404);
      } else {

        for (let index = 0; index < data.value.parent_of?.length; index++) {
          for (
            let i = 0;
            i < data.value.parent_of[index].parent_of?.length;
            i++
          ) {
            jsonData.push({
              buildingName: data.value.name,
              zoneName: data.value.parent_of[index].parent_of[i].name,
              category:
                data.value.parent_of[index].parent_of[i].classified_by[0].name,
              createdBy:
                data.value.parent_of[index].parent_of[i].created_by[0].email,
              spaceNames:
                data.value.parent_of[index].parent_of[i].spaceNames.toString(),
              description: data.value.parent_of[index].parent_of[i].description,
              tags: data.value.parent_of[index].parent_of[i].tag.toString(),
            });
          }
        }

        return jsonData;
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getSpacesAnExcelFile(
    res,
    body: ExportExcelDto,
    header: UserInformationInterface
  ) {
    let { buildingKeys } = body;
    let { realm, username, language } = header;
    try {
      let data = [];

      for (let item of buildingKeys) {
        let newData = await this.getSpacesByBuilding(
          realm,
          username,
          item,
          language
        );
        if (newData instanceof Error) {
          throw new HttpException(there_are_no_spaces_object, 404);
        } else {
          data = [...data, ...newData];
        }
      }
      let workbook = new exceljs.Workbook();
      let worksheet = workbook.addWorksheet("Spaces");

      worksheet.columns = [
        { header: "Building Name", key: "buildingName", width: 50 },
        { header: "Block Name", key: "blockName", width: 50 },
        { header: "Floor Name", key: "floorName", width: 50 },
        { header: "Space Name", key: "spaceName", width: 50 },
        { header: "Code", key: "code", width: 50 },
        { header: "architecturalName", key: "architecturalName", width: 50 },
        { header: "architecturalCode", key: "architecturalCode", width: 50 },
        { header: "grossArea", key: "grossArea", width: 50 },
        { header: "netArea", key: "netArea", width: 50 },
        { header: "usage", key: "usage", width: 50 },
        { header: "tag", key: "tag", width: 50 },
        { header: "roomTag", key: "roomTag", width: 50 },
        { header: "status", key: "status", width: 50 },
        { header: "operatorName", key: "operatorName", width: 50 },
        { header: "operatorCode", key: "operatorCode", width: 50 },
        { header: "description", key: "description", width: 50 },
        { header: "usableHeight", key: "usableHeight", width: 50 },
        { header: "externalSystem", key: "externalSystem", width: 50 },
        { header: "externalObject", key: "externalObject", width: 50 },
        { header: "externalIdentifier", key: "externalIdentifier", width: 50 },
        { header: "createdAt", key: "createdAt", width: 50 },
        { header: "createdBy", key: "createdBy", width: 50 },
      ];

      worksheet.addRows(data);
      return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getZonesAnExcelFile(
    res,
    body: ExportExcelDto,
    header: UserInformationInterface
  ) {
    let { buildingKeys } = body;
    let { realm, username, language } = header;
    try {
      let data = [];

      for (let item of buildingKeys) {
        let newData = await this.getZonesByBuilding(
          realm,
          username,
          item,
          language
        );
        if (newData instanceof Error) {
          throw new HttpException(there_are_no_zones_object, 404);
        } else {
          data = [...data, ...newData];
        }
      }

      let workbook = new exceljs.Workbook();
      let worksheet = workbook.addWorksheet("Zones");

      worksheet.columns = [
        { header: "buildingName", key: "buildingName", width: 50 },
        { header: "zoneName", key: "zoneName", width: 50 },
        { header: "category", key: "category", width: 50 },
        { header: "createdBy", key: "createdBy", width: 50 },
        { header: "spaceNames", key: "spaceNames", width: 50 },
        { header: "description", key: "description", width: 90 },
        { header: "tags", key: "tags", width: 50 },
      ];

      worksheet.addRows(data);
      return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
      // if(error.response?.code===10012){
      //   there_are_no_zones()
      // }else {
      //   default_error()
      // }
    }
  }

  async getJointSpacesAnExcelFile(
    res,
    body: ExportExcelDto,
    header: UserInformationInterface
  ) {
    let { buildingKeys } = body;
    let { realm, username, language } = header;
    try {
      let data = [];
      for (let item of buildingKeys) {
        let newData = await this.getJointSpacesByBuilding(
          realm,
          username,
          item,
          language
        );
        if (newData instanceof Error) {
          throw new HttpException(there_are_no_jointSpaces_object, 404);
        } else {
          data = [...data, ...newData];
        }
      }

      let workbook = new exceljs.Workbook();
      let worksheet = workbook.addWorksheet("JointSpaces");

      worksheet.columns = [
        { header: "buildingName", key: "buildingName", width: 50 },
        { header: "jointSpaceName", key: "jointSpaceName", width: 50 },
        { header: "category", key: "category", width: 50 },
        { header: "createdBy", key: "createdBy", width: 50 },
        { header: "description", key: "description", width: 90 },
        { header: "tags", key: "tags", width: 50 },
        { header: "roomTags", key: "roomTags", width: 50 },
        { header: "status", key: "status", width: 50 },
        { header: "usage", key: "usage", width: 50 },
        { header: "usableHeight", key: "usableHeight", width: 50 },
        { header: "grossArea", key: "grossArea", width: 50 },
        { header: "netArea", key: "netArea", width: 50 },
      ];

      worksheet.addRows(data);
      return workbook.xlsx.write(res).then(function () {
        res.status(200).end();
      });
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async getContactByRealmAndByLanguage(res, header: UserInformationInterface) {
    const { language, username, realm } = header;

    try {
      let data: any;
      let jsonData = [];
      let cypher = `CALL apoc.export.json.query("match (b:Contacts {realm:'${realm}'})-[:PARENT_OF {isDeleted:false}]->(m:Contact)-[:CLASSIFIED_BY {isDeleted:false}]->(c) where m.isDeleted=false and c.language='${language}' return m,c.name as classificationName limit 100000",'/${username}.json',{jsonFormat:'ARRAY_JSON'})
    YIELD file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data
    RETURN file, source, format, nodes, relationships, properties, time, rows, batchSize, batches, done, data`;

      await this.write(cypher);

      //call the file using below code
      let cypher2 = `CALL apoc.load.json("${username}.json")`;

      let returnData = await this.read(cypher2);
      data = returnData.records;

      if (data.length == 0) {
        throw new HttpException(there_are_no_contacts_object, 404);
      } else {
        for (let index = 0; index < data.length; index++) {
          jsonData.push({
            ...data[index]["_fields"][0].m.properties,
            ...{
              classificationName:
                data[index]["_fields"][0]["classificationName"],
            },
          });
        }

        let workbook = new exceljs.Workbook();
        let worksheet = workbook.addWorksheet("Contacts");

        worksheet.columns = [
          { header: "Email", key: "email", width: 50 },
          { header: "Name", key: "givenName", width: 50 },
          { header: "Last Name", key: "familyName", width: 50 },
          { header: "Phone", key: "phone", width: 50 },
          { header: "Company", key: "company", width: 50 },
          { header: "Department", key: "department", width: 50 },
          { header: "Organization Code", key: "organizationCode", width: 50 },
          { header: "State Region", key: "stateRegion", width: 50 },
          { header: "Town", key: "town", width: 50 },
          { header: "Postal Box", key: "postalBox", width: 50 },
          { header: "Postal Code", key: "postalCode", width: 50 },
          { header: "Category", key: "classificationName", width: 70 },
        ];

        worksheet.addRows(jsonData);

        return workbook.xlsx.write(res).then(function () {
          res.status(200).end();
        });
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async addBuildingWithCobie(
    file: Express.Multer.File,
    header: MainHeaderInterface
  ) {
    try {
      const { realm } = header;
      let email: string;

      let data = [];

      let buffer = new Uint8Array(file.buffer);
      const workbook = new exceljs.Workbook();

      await workbook.xlsx.load(buffer).then(function async(book) {
        const firstSheet = book.getWorksheet(3);
        firstSheet.eachRow({ includeEmpty: false }, function (row) {
          data.push(row.values);
        });
      });

      let checkBuilding = await this.findChildrensByLabelsAndFilters(
        ["FacilityStructure"],
        { realm },
        [`Building`],
        { name: data[1][1], isDeleted: false },
        'PARENT_OF',
        {isDeleted: false},
        1
      );
      if (checkBuilding.length == 0) {
        let categoryCode = await data[1][4].split(": ");
        let { createdCypher, createdRelationCypher } =
          await this.createCypherForClassification(
            realm,
            "OmniClass11",
            categoryCode[0],
            "b",
            "cc",
            "c",
            "CLASSIFIED_BY"
          );

        if (typeof data[1][2] == "object") {
          email = await data[1][2].text;
        } else {
          email = await data[1][2];
        }

        //CYPHER QUERY FOR BUILDING

        let cypher = `MATCH (r:FacilityStructure {realm:"${realm}"}) ${createdCypher} \
  MATCH (cnt:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false} ) \
  MERGE (b:Building {name:"${data[1][1]}",createdAt:"${
          data[1][3]
        }",projectName:"${data[1][5]}",siteName:"${
          data[1][6]
        }",areaMeasurement:"${data[1][11]}",externalSystem:"${
          data[1][12]
        }",externalObject:"${data[1][13]}", \
  externalIdentifier:"${data[1][14]}",externalSiteObject:"${
          data[1][15]
        }",externalSiteIdentifier:"${data[1][16]}",externalFacilityObject:"${
          data[1][17]
        }",externalFacilityIdentifier:"${data[1][18]}", \
  description:"${data[1][19]}",projectDescription:"${
          data[1][20]
        }",siteDescription:"${data[1][21]}",phase:"${
          data[1][22]
        }",address:"",status:"${data[1][23]}",code:"${
          data[1][24]
        }",owner:"",operator:"",contractor:"",handoverDate:"",operationStartDate:"",warrantyExpireDate:"",tag:[],canDisplay:true,key:"${this.keyGenerate()}",canDelete:true,isActive:true,isDeleted:false, \
  nodeType:"Building"}) MERGE (js:JointSpaces {key:"${this.keyGenerate()}",canDelete:false,canDisplay:false,isActive:true,isDeleted:false,name:"Joint Space",nodeType:"JointSpaces"})\ 
  MERGE (zs:Zones {key:"${this.keyGenerate()}",canDelete:false,canDisplay:false,isActive:true,isDeleted:false,name:"Zones",nodeType:"Zones"})\ 
  MERGE (b)-[:PARENT_OF {isDeleted:false}]->(zs) MERGE (b)-[:PARENT_OF {isDeleted:false}]->(js)  MERGE (r)-[:PARENT_OF {isDeleted:false}]->(b) ${createdRelationCypher} MERGE (b)-[:CREATED_BY {isDeleted:false}]->(p) ;`;

        await this.write(cypher);
      } else {
        throw new HttpException(building_already_exist_object(), 400);
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          { message: error.response?.message, code: error.response?.code },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async addBlocksToBuilding(
    file: Express.Multer.File,
    header: MainHeaderInterface,
    buildingKey: string
    ) {
      let data = [];
    try {
      let email: string;
      const { realm } = header;

      let buffer = new Uint8Array(file.buffer);
      const workbook = new exceljs.Workbook();

      await workbook.xlsx.load(buffer).then(function async(book) {
        const firstSheet = book.getWorksheet(4);
        firstSheet.eachRow({ includeEmpty: false }, function (row) {
          data.push(row.values);
        });
      });

      for (let i = 0; i < data.length; i++) {
        let checkBlock = await this.findChildrensByLabelsAndFilters(
          ['Building'],
          { key: buildingKey, isDeleted: false },
          [`Block`],
          { name: data[i][1], isDeleted: false },
          'PARENT_OF',
          {isDeleted: false},
          1
        );


        if(checkBlock.length==0){
          
          if (typeof data[i][2] == "object") {
            email = await data[i][2].text;
          } else {
            email = await data[i][2];
          }

          let cypher = `MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
                   MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) \
                   MERGE (f:Block {code:"",name:"${
                     data[i][1]
                   }",isDeleted:false,isActive:true,nodeType:"Block",description:"${
            data[i][8]
          }",tag:[],canDelete:true,canDisplay:true,key:"${this.keyGenerate()}",createdAt:"${
            data[i][3]
          }",elevation:"${data[i][9]}",height:"${
            data[i][10]
          }",externalSystem:"",externalObject:"",externalIdentifier:""}) \
                   MERGE (b)-[:PARENT_OF {isDeleted:false}]->(f)\
                   MERGE (f)-[:CREATED_BY {isDeleted:false}]->(p)`;

          await this.write(cypher);
        }
        else {
          throw new HttpException(
            { ...block_already_exist_object, name: data[i][1] },
            400
          );
        }
      }


    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          {
            message: error.response?.message,
            code: error.response?.code,
            name: error.response?.name,
          },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async addFloorsToBuilding(
    file: Express.Multer.File,
    header: MainHeaderInterface,
    buildingKey: string
  ) {
    let data = [];
    try {
      let email: string;
      const { realm } = header;

      let buffer = new Uint8Array(file.buffer);
      const workbook = new exceljs.Workbook();

      await workbook.xlsx.load(buffer).then(function async(book) {
        const firstSheet = book.getWorksheet(4);
        firstSheet.eachRow({ includeEmpty: false }, function (row) {
          data.push(row.values);
        });
      });

      for (let i = 1; i < data.length; i++) {
        let checkFloor = await this.findChildrensByLabelsAndFilters(
          ["Building"],
          { key: buildingKey, isDeleted: false },
          [`Floor`],
          { name: data[i][2], isDeleted: false },
          'PARENT_OF',
          {isDeleted: false},
          ""
        );

        if (checkFloor.length == 0) {
          let { createdCypher, createdRelationCypher } =
            await this.createCypherForClassification(
              realm,
              "FacilityFloorTypes",
              data[i][5],
              "f",
              "cc",
              "c",
              "CLASSIFIED_BY"
            );

          if (typeof data[i][3] == "object") {
            email = await data[i][3].text;
          } else {
            email = await data[i][3];
          }

          if(data[i][1]){
            let cypher = `MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
            ${createdCypher} \
            MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) \
            MERGE (blck:Block {name:"${data[i][1]}",isDeleted:false,isActive:true,canDelete:true,canDisplay:true,nodeType:"Block",createdAt:"${
              data[i][4]
            }",tag:[],key:"${this.keyGenerate()}"})
            MERGE (f:Floor {code:"",name:"${
              data[i][2]
            }",isDeleted:false,isActive:true,nodeType:"Floor",description:"${
              data[i][9]
            }",tag:[],canDelete:true,canDisplay:true,key:"${this.keyGenerate()}",createdAt:"${
              data[i][4]
            }",elevation:"${data[i][10]}",height:"${
              data[i][11]
            }",externalSystem:"",externalObject:"",externalIdentifier:""}) \
            MERGE (b)-[:PARENT_OF {isDeleted:false}]->(blck)
            MERGE (blck)-[:PARENT_OF {isDeleted:false}]->(f)\
            ${createdRelationCypher} \
            MERGE (blck)-[:CREATED_BY {isDeleted:false}]->(p) \
            MERGE (f)-[:CREATED_BY {isDeleted:false}]->(p)`;

            await this.write(cypher);
          }else {
            let cypher = `MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
            ${createdCypher} \
            MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) \
            MERGE (f:Floor {code:"",name:"${
              data[i][2]
            }",isDeleted:false,isActive:true,nodeType:"Floor",description:"${
            data[i][9]
          }",tag:[],canDelete:true,canDisplay:true,key:"${this.keyGenerate()}",createdAt:"${
            data[i][4]
          }",elevation:"${data[i][10]}",height:"${
            data[i][11]
          }",externalSystem:"",externalObject:"",externalIdentifier:""}) \
            MERGE (b)-[:PARENT_OF {isDeleted:false}]->(f)\
            ${createdRelationCypher} \
            MERGE (f)-[:CREATED_BY {isDeleted:false}]->(p)`;

   await this.write(cypher);
          }
        
        } else {
          throw new HttpException(
            { ...floor_already_exist_object, name: data[i][1] },
            400
          );
        }
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          {
            message: error.response?.message,
            code: error.response?.code,
            name: error.response?.name,
          },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async addFloorsToBlockOrBuilding(
    file: Express.Multer.File,
    header: MainHeaderInterface,
    buildingKey: string
  ) {
    let data = [];
    try {
      let email: string;
      const { realm } = header;

      let buffer = new Uint8Array(file.buffer);
      const workbook = new exceljs.Workbook();

      await workbook.xlsx.load(buffer).then(function async(book) {
        const firstSheet = book.getWorksheet(4);
        firstSheet.eachRow({ includeEmpty: false }, function (row) {
          data.push(row.values);
        });
      });

      for (let i = 1; i < data.length; i++) {

          let { createdCypher, createdRelationCypher } =
            await this.createCypherForClassification(
              realm,
              "FacilityFloorTypes",
              data[i][5],
              "f",
              "cc",
              "c",
              "CLASSIFIED_BY"
            );

          if (typeof data[i][3] == "object") {
            email = await data[i][3].text;
          } else {
            email = await data[i][3];
          }

          if(data[i][1]){
           
            let cypher = `MATCH (fs:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]-(b:Building {isDeleted:false ,key:"${buildingKey}"})-[:PARENT_OF {isDeleted:false}]->(blck:Block {name:"${data[i][1]}",isDeleted:false})-[:PARENT_OF {isDeleted:false}]->(f:Floor {name:"${data[i][2]}",isDeleted:false}) return f;`
            let checkFloor = await this.read(cypher);

            if(checkFloor.records.length==0){
              let cypher = `MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
              ${createdCypher} \
              MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) \
              ${await this.getBlockFromDb(buildingKey,data[i])}
              MERGE (f:Floor {code:"",name:"${
                data[i][2]
              }",isDeleted:false,isActive:true,nodeType:"Floor",description:"${
                data[i][9]
              }",tag:[],canDelete:true,canDisplay:true,key:"${this.keyGenerate()}",createdAt:"${
                data[i][4]
              }",elevation:"${data[i][10]}",height:${
                data[i][11]
              }.0,externalSystem:"",externalObject:"",externalIdentifier:""}) \
              MERGE (b)-[:PARENT_OF {isDeleted:false}]->(blck)
              MERGE (blck)-[:PARENT_OF {isDeleted:false}]->(f)\
              ${createdRelationCypher} \
              MERGE (blck)-[:CREATED_BY {isDeleted:false}]->(p) \
              MERGE (f)-[:CREATED_BY {isDeleted:false}]->(p)`;
  
            await this.write(cypher);
            }
            else {
              throw new HttpException(floor_already_exist_object(data[i][2]),400);
            }

         
        
          }else {

            let checkFloor = await this.findChildrensByLabelsAndFilters(
              ["Building"],
              { key: buildingKey, isDeleted: false },
              [`Floor`],
              { name: data[i][2], isDeleted: false },
              'PARENT_OF',
              {isDeleted: false},
              1
            );
            if (checkFloor.length == 0) {

              let cypher = `MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
              ${createdCypher} \
              MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) \
              MERGE (f:Floor {code:"",name:"${
                data[i][2]
              }",isDeleted:false,isActive:true,nodeType:"Floor",description:"${
              data[i][9]
            }",tag:[],canDelete:true,canDisplay:true,key:"${this.keyGenerate()}",createdAt:"${
              data[i][4]
            }",elevation:"${data[i][10]}",height:${
              data[i][11]
            }.0,externalSystem:"",externalObject:"",externalIdentifier:""}) \
              MERGE (b)-[:PARENT_OF {isDeleted:false}]->(f) \
              ${createdRelationCypher} \
              MERGE (f)-[:CREATED_BY {isDeleted:false}]->(p)`;
  
         await this.write(cypher);
            }else{
              throw new HttpException(floor_already_exist_object(data[i][2]),400);
            }
          }
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          {
            message: error.response?.message,
            code: error.response?.code,
            name: error.response?.name,
          },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async addSpacesToBlockOrBuilding(
    file: Express.Multer.File,
    header: MainHeaderInterface,
    buildingKey: string
  ) {
    try {
      let email: string;
      const { realm } = header;

      let data = [];
      let buffer = new Uint8Array(file.buffer);
      const workbook = new exceljs.Workbook();

      await workbook.xlsx.load(buffer).then(function async(book) {
        const firstSheet = book.getWorksheet(5);
        firstSheet.eachRow({ includeEmpty: false }, function (row) {
          data.push(row.values);
        });
      });

      for (let i = 1; i < data.length; i++) {
       
       
          const [code, ...rest] = await data[i][8].split(new RegExp(/:\s{1}/g));
          const [code2, ...rest2] = await data[i][18].split(new RegExp(/:\s{1}/g));
          const [code3, ...rest3] = await data[i][19].split(new RegExp(/:\s{1}/g));
          
          let { createdCypher, createdRelationCypher } =
            await this.createCypherForClassification(
              realm,
              "OmniClass13",
              code,
              "s",
              "cc",
              "c",
              "CLASSIFIED_BY"
            );

            let { createdCypher:createdCypher2, createdRelationCypher:createdRelationCypher2 } =
            await this.createCypherForClassification(
              realm,
              "SpaceUsageType",
              code2,
              "s",
              "sutm",
              "sut",
              "USAGE_BY"
            );

            let { createdCypher:createdCypher3, createdRelationCypher:createdRelationCypher3 } =
            await this.createCypherForClassification(
              realm,
              "FacilityStatus",
              code3,
              "s",
              "fsm",
              "fs",
              "STATUS_BY"
            );

          if (typeof data[i][6] == "object") {
            email = await data[i][6].text;
          } else {
            email = await data[i][6];
          }
              if(data[i][1]){

                let cypher2 = `MATCH (fs:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]-(b:Building {isDeleted:false ,key:"${buildingKey}"})-[:PARENT_OF {isDeleted:false}]->(blck:Block {name:"${data[i][1]}",isDeleted:false})-[:PARENT_OF {isDeleted:false}]->(f:Floor {name:"${data[i][9]}",isDeleted:false}) return f;`
            let checkFloor = await this.read(cypher2);
            let cypher3 = `MATCH (fs:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]-(b:Building {isDeleted:false ,key:"${buildingKey}"})-[:PARENT_OF {isDeleted:false}]->(blck:Block {name:"${data[i][1]}",isDeleted:false})-[:PARENT_OF* {isDeleted:false}]->(s:Space {code:"${data[i][4]}",isDeleted:false}) return s;`
            let checkSpace = await this.read(cypher3);

            if(checkFloor.records.length>0 && checkSpace.records.length ==0) {
              let cypher = `MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
              MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) \
              ${createdCypher} \
              ${createdCypher2} \
              ${createdCypher3} \
              MATCH (b)-[:PARENT_OF {isDeleted:false}]->(blck:Block {name:"${data[i][1]}",isDeleted:false})-[:PARENT_OF {isDeleted:false}]->(f:Floor {name:"${
                data[i][9]
              }",isDeleted:false}) \
              MERGE (s:Space {name:"${data[i][2]}",code:"${data[i][4]}",architecturalCode:"${data[i][5]}",architecturalName:"${
                  data[i][3]
                }",createdAt:"${
                  data[i][7]
                }",description:"${
                  data[i][10]
                }",key:"${this.keyGenerate()}",externalSystem:"${
                  data[i][11]
                }",externalObject:"${data[i][12]}",externalIdentifier:"${
                  data[i][13]
                }", \ 
              tag:[],roomTag:["${data[i][14]}"],usableHeight:${
                  data[i][15]
                }.0,grossArea:${data[i][16]}.0,netArea:${
                  data[i][17]
                }.0,images:"",documents:"", \
              canDisplay:true,isDeleted:false,isActive:true,nodeType:"Space",isBlocked:false,canDelete:true}) \
              MERGE (f)-[:PARENT_OF {isDeleted:false}]->(s) MERGE (s)-[:CREATED_BY {isDeleted:false}]->(p) ${createdRelationCypher} ${createdRelationCypher2} ${createdRelationCypher3};`;
                await this.write(cypher);
                
            }else{
              throw new HttpException(space_already_exist_object(`${data[i][5]} / ${data[i][2]}`),400);
            }

       

          }else {

                let checkSpaces = await this.findChildrensByLabelsAndFilters(
                  ["Building"],
                  { key: buildingKey },
                  [`Space`],
                  { code: typeof data[i][4]  == "number" ? data[i][4].toString() : data[i][4], isDeleted: false },
                  'PARENT_OF',
                  {isDeleted: false}
                );
                if (checkSpaces.length == 0) {

                  let cypher = `MATCH (a:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}",isDeleted:false}) \
                  MATCH (cont:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) \
                  ${createdCypher} \
                  ${createdCypher2} \
                  ${createdCypher3} \
                  MATCH (b)-[:PARENT_OF* {isDeleted:false}]->(f:Floor {name:"${
                    data[i][9]
                  }",isDeleted:false}) \
                  MERGE (s:Space {name:"${
                    data[i][2]}
                  ",code:"${data[i][4]}",architecturalCode:"${data[i][5]}",architecturalName:"${
                      data[i][3]
                    }",createdAt:"${
                      data[i][7]
                    }",description:"${
                      data[i][10]
                    }",key:"${this.keyGenerate()}",externalSystem:"${
                      data[i][11]
                    }",externalObject:"${data[i][12]}",externalIdentifier:"${
                      data[i][13]
                    }", \ 
                  tag:[],roomTag:["${data[i][14]}"],usableHeight:${
                      data[i][15]
                    }.0,grossArea:${data[i][16]}.0,netArea:${
                      data[i][17]
                    }.0,images:"",documents:"", \
                  canDisplay:true,isDeleted:false,isActive:true,nodeType:"Space",isBlocked:false,canDelete:true}) \
                  MERGE (f)-[:PARENT_OF {isDeleted:false}]->(s) MERGE (s)-[:CREATED_BY {isDeleted:false}]->(p) ${createdRelationCypher} ${createdRelationCypher2} ${createdRelationCypher3};`;
                    await this.write(cypher);
                }else{
                  throw new HttpException(space_already_exist_object(`${data[i][5]} / ${data[i][2]}`),400);
                }

              }

      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          {
            message: error.response?.message,
            code: error.response?.code,
            name: error.response?.name,
          },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async addZonesToBuilding(
    file: Express.Multer.File,
    header: MainHeaderInterface,
    buildingKey: string
  ) {
    try {
      let email: string;
      const { realm } = header;
      let data = [];
      let buffer = new Uint8Array(file.buffer);
      const workbook = new exceljs.Workbook();

      await workbook.xlsx.load(buffer).then(function async(book) {
        const firstSheet = book.getWorksheet(6);
        firstSheet.eachRow({ includeEmpty: false }, function (row) {
          data.push(row.values);
        });
      });

      for (let i = 1; i < data.length; i++) {
        let cypher = `MATCH (n:Building {key:"${buildingKey}",isDeleted:false})-[:PARENT_OF* {isDeleted:false}]->(s:Space {architecturalCode:"${data[i][5]}",isDeleted:false}) \ 
  MATCH (s)-[:MERGEDZN {isDeleted:false}]->(z:Zone {name:"${data[i][1]}",isDeleted:false}) return z`;
        let returnData = await this.read(cypher);

        if (returnData.records.length == 0) {
          let { createdCypher, createdRelationCypher } =
            await this.createCypherForClassification(
              realm,
              "FacilityZoneTypes",
              data[i][4],
              "zz",
              "cc",
              "c",
              "CLASSIFIED_BY"
            );

          if (typeof data[i][2] == "object") {
            email = await data[i][2].text;
          } else {
            email = await data[i][2];
          }

          let cypher = `MATCH (b:Building {key:"${buildingKey}"})-[:PARENT_OF]->(z:Zones {name:"Zones"})\
   MATCH (c:Space {architecturalCode:"${data[i][5]}",isDeleted:false})\
   MATCH (cnt:Contacts {realm:"${realm}"})-[:PARENT_OF]->(p:Contact {email:"${email}",isDeleted:false})\
   ${createdCypher} \
   ${await this.getZoneFromDb(buildingKey, data[i])} \
   MERGE (z)-[:PARENT_OF {isDeleted:false}]->(zz)  \
   MERGE (c)-[:MERGEDZN {isDeleted:false}]->(zz)  \
   ${createdRelationCypher} \
   MERGE (zz)-[:CREATED_BY {isDeleted:false}]->(p);`;

          await this.write(cypher);
        } else {
          throw new HttpException(space_has_already_relation_object(),400);
        }
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          {
            message: error.response?.message,
            code: error.response?.code,
            name: error.response?.name,
          },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async addContacts(file: Express.Multer.File, header: MainHeaderInterface) {
    try {
      let email: string;
      let createdByEmail: string;
      const { realm } = header;

      let data = [];
      let buffer = new Uint8Array(file.buffer);
      const workbook = new exceljs.Workbook();

      await workbook.xlsx.load(buffer).then(function async(book) {
        const firstSheet = book.getWorksheet(2);
        firstSheet.eachRow({ includeEmpty: false }, function (row) {
          data.push(row.values);
        });
      });

      for (let i = 1; i < data.length; i++) {
        const [code, ...rest] = await data[i][4].split(new RegExp(/:\s{1}/g));

        let { createdCypher, createdRelationCypher } =
          await this.createCypherForClassification(
            realm,
            "OmniClass34",
            code,
            "p",
            "clsp",
            "cls",
            "CLASSIFIED_BY"
          );

        if (typeof data[i][1] == "object") {
          email = await data[i][1].text;
        } else {
          email = await data[i][1];
        }
        if (typeof data[i][2] == "object") {
          createdByEmail = await data[i][2].text;
        } else {
          createdByEmail = await data[i][2];
        }

        let checkEmail = await this.findChildrensByLabelsAndFilters(
          ["Contacts"],
          { realm },
          ["Contact"],
          { email, isDeleted: false },
          'PARENT_OF',
          {isDeleted: false},
          1
        );
        if (checkEmail.length == 0) {
          let cypher = `MATCH (c:Contacts {realm:"${realm}"}) ${createdCypher} \
      MERGE (p:Contact {email:"${email}",createdAt:"${data[i][3]}",company:"${
            data[i][5]
          }", phone:"${data[i][6]}",externalSystem:"${
            data[i][7]
          }",externalObject:"${data[i][8]}",externalIdentifier:"${
            data[i][9]
          }",department:"${data[i][10]}",organizationCode:"${data[i][11]}", \
      givenName:"${data[i][12]}",familyName:"${data[i][13]}",street:"${
            data[i][14]
          }",postalBox:"${data[i][15]}",town:"${data[i][16]}",stateRegion:"${
            data[i][17]
          }",postalCode:"${data[i][18]}",country:"${
            data[i][19]
          }",canDisplay:true,isDeleted:false,isActive:true,className:"Contact",key:"${this.keyGenerate()}",canDelete:true, tag:[] } )\
      MERGE (c)-[a:PARENT_OF {isDeleted:false}]->(p)  ${createdRelationCypher}`;
          await this.write(cypher);

          let cypher2 = `MATCH (p:Contact {email:"${email}"}) MATCH (p2:Contact {email:"${createdByEmail}"}) MERGE (p)-[:CREATED_BY {isDeleted:false}]->(p2)`;
          await this.write(cypher2);
        } else {
          throw new HttpException(
            { ...contact_already_exist_object, name: email },
            400
          );
        }
      }
    } catch (error) {
      if (error.response?.code) {
        throw new HttpException(
          {
            message: error.response?.message,
            code: error.response?.code,
            name: error.response?.name,
          },
          error.status
        );
      } else {
        throw new HttpException(error,500);
      }
    }
  }

  async createCypherForClassification(
    realm: string,
    classificationLabel: string,
    categoryCode: string,
    nodeName: string,
    classificationParentPlaceholder: string,
    classificationChildrenPlaceholder: string,
    relationName: string
  ) {
    try {
      let createCypherArray = [];
      let createRelationCypher = [];
      let cypher = `MATCH (a:Language_Config {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(z) return z`;
      let value = await this.read(cypher);
      let datasLength = value.records;
  
      for (let index = 0; index < datasLength.length; index++) {
        let createdCypher = ` MATCH (${classificationParentPlaceholder}${index}:${classificationLabel}_${datasLength[index]["_fields"][0].properties.name} {realm:"${realm}"})-[:PARENT_OF* {isDeleted:false}]->(${classificationChildrenPlaceholder}${index} {code:"${categoryCode}",language:"${datasLength[index]["_fields"][0].properties.name}"})`;
        let createdRelationCypher = ` MERGE (${nodeName})-[:${relationName} {isDeleted:false} ]->(${classificationChildrenPlaceholder}${index}) `;
        createCypherArray.push(createdCypher);
        createRelationCypher.push(createdRelationCypher);
      }
  
      return {
        createdCypher: createCypherArray.join(" "),
        createdRelationCypher: createRelationCypher.join(" "),
      };
    } catch (error) {
      throw new HttpException(error,500);
    }
  
  }

  async getZoneFromDb(buildingKey: string, data: string[]) {
    try {
      let cypher = `MATCH (b:Building {key:"${buildingKey}"})-[:PARENT_OF {isDeleted:false}]->(zz:Zones {name:"Zones"})-[:PARENT_OF {isDeleted:false}]->(z:Zone {name:"${data[1]}",isDeleted:false}) return z`;
    let returnData = await this.read(cypher);

    if (returnData.records?.length == 1) {
      return `Match (zz:Zone {key:"${returnData.records[0]["_fields"][0].properties.key}",isDeleted:false}) SET zz.spaceNames = zz.spaceNames + "${data[5]}"`;
    } else {
      return `MERGE (zz:Zone {name:"${data[1]}",createdAt:"${
        data[3]
      }",externalSystem:"${data[6]}", externalObject:"${
        data[7]
      }", externalIdentifier:"${data[8]}", description:"${data[9]}", tag:[],\
    nodeKeys:[], nodeType:"Zone",images:[],documents:[],spaceNames:["${
      data[5]
    }"], key:"${this.keyGenerate()}", canDisplay:true, isActive:true, isDeleted:false, canDelete:true})\
    MERGE (z)-[:PARENT_OF {isDeleted:false}]->(zz)`;
    }
    } catch (error) {
      throw new HttpException(error,500);
    }
    
  }

  async getBlockFromDb(buildingKey: string, data: string[]) {
    try {
      let cypher = `MATCH (b:Building {key:"${buildingKey}" ,isDeleted:false})-[:PARENT_OF {isDeleted:false}]->(blck:Block {name:"${data[1]}",isDeleted:false}) return blck`;
    let returnData = await this.read(cypher);

    if (returnData.records?.length == 1) {
      return `MATCH (blck:Block {key:"${returnData.records[0]["_fields"][0].properties.key}",isDeleted:false})`;
    } else {
      return `MERGE (blck:Block {name:"${data[1]}",isDeleted:false,isActive:true,canDelete:true,canDisplay:true,nodeType:"Block",createdAt:"${
        data[4]
      }",tag:[],key:"${this.keyGenerate()}"})`;
    }
    } catch (error) {
      throw new HttpException(error,500);
    }
    
  }

  async getSystemRelationFromDb(
    realm: string,
    data: string[],
    emailReference: any,
    urlContact: string
  ) {
    try {
      let cypher = `MATCH (a:Systems {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(s:System {name:"${data[1]}",isDeleted:false})-[rel:CREATED_BY {isDeleted:false}]->(p:Contact :Virtual) return rel;`;
      let returnData = await this.read(cypher);
  
      if (returnData.records?.length == 1) {
        return ``;
      } else {
        return `MERGE (cnt :Contact :Virtual {key:"${this.keyGenerate()}",referenceId:"${await 
          emailReference[0].id
        }",referenceLabel:"Contact",urlType:"GET",type:"createdBy",isDeleted:false,createdAt:"${moment().format(
          "YYYY-MM-DD HH:mm:ss"
        )}",canDelete:true ,url:"${urlContact}/${emailReference[0]['id']}"}) \
      MERGE (s)-[:CREATED_BY {isDeleted:false}]->(cnt) MERGE (s)-[:HAS_VIRTUAL_RELATION {isDeleted:false}]->(cnt)`;
      }
    } catch (error) {
      throw new HttpException(error,500);
    }
  
  }

  async componentAlreadyExist(realm:string,data:string[]){

    try {
      let cypher = `MATCH (n:Types {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(t:Type {name:"${data[4]}",isDeleted:false}) \ 
      MATCH (t)-[:PARENT_OF {isDeleted:false}]->(c:Component {name:"${data[1]}",isDeleted:false}) return c`;
      let returnData = await this.read(cypher);
      return returnData.records;
    } catch (error) {
      throw new HttpException(error,500);
    }
    
}

  async createComponent(realm:string,data:string[],warrantyGuarantorPartsReferenceId:string,warrantyGuarantorLaborReferenceKeyId:string,warrantyDurationLabor:string,warrantyDurationParts:string,spaceAndCreatedByArray:string[],wgpAndWglNames:string[],urlContact:string,urlStructure:string){
 try {
  let cypher =`MATCH (tt:Types {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(t:Type {name:"${data[4]}",isDeleted:false}) \
  MERGE (c:Component {className:"Component",name:"${data[1]}",createdAt:"${data[3]}",description:"${data[6]}",externalSystem:"${data[7]}",externalObject:"${data[8]}", \
  externalIdentifier:"${data[9]}",serialNumber:"${data[10]}",installationDate:"${data[11]}",warrantyStartDate:"${data[12]}",tagNumber:"${data[13]}", \
  barCode:"${data[14]}",assetIdentifier:"${data[15]}",key:"${this.keyGenerate()}",warrantyDurationLabor:${+warrantyDurationLabor}.0,warrantyDurationParts:${+warrantyDurationParts}.0,warrantyDurationUnit:"",tag:[],spaceName:"${spaceAndCreatedByArray[1]['name']}",isDeleted:false,canDelete:true,isActive:true,canDisplay:true}) \
  SET c+={id:toFloat(Id(c))}
  MERGE (wgp :Contact :Virtual {key:"${this.keyGenerate()}",referenceId:"${warrantyGuarantorPartsReferenceId}",name:"${wgpAndWglNames[0]['name']}",virtualPropertyField:"email",referenceLabel:["Contact"],type:"warrantyGuarantorParts",isDeleted:false,createdAt:"${moment().format('YYYY-MM-DD HH:mm:ss')}",canDelete:true, urlType:"GET"}) \
  SET wgp+={url:"${urlContact}/"+"${warrantyGuarantorPartsReferenceId}"}  \
  MERGE (wgl :Contact :Virtual {key:"${this.keyGenerate()}",referenceId:"${warrantyGuarantorLaborReferenceKeyId}",name:"${wgpAndWglNames[1]['name']}",virtualPropertyField:"email",referenceLabel:["Contact"],type:"warrantyGuarantorLabor",isDeleted:false,createdAt:"${moment().format('YYYY-MM-DD HH:mm:ss')}",canDelete:true, urlType:"GET"}) \
  SET wgl+={url:"${urlContact}/"+"${warrantyGuarantorLaborReferenceKeyId}"}  \
  MERGE (cnt :Contact :Virtual {key:"${this.keyGenerate()}",referenceId:"${spaceAndCreatedByArray[0]['id']}",name:"${wgpAndWglNames[2]['name']}",virtualPropertyField:"email",referenceLabel:["Contact"],type:"createdBy",isDeleted:false,createdAt:"${moment().format('YYYY-MM-DD HH:mm:ss')}",canDelete:true, urlType:"GET"}) \
  SET cnt+={url:"${urlContact}/"+"${spaceAndCreatedByArray[0]['id']}"}  \
  MERGE (spc :FacilityStructure :Virtual {key:"${this.keyGenerate()}",referenceId:"${spaceAndCreatedByArray[1]['id']}",name:"${spaceAndCreatedByArray[1]['name']}",virtualPropertyField:"name",referenceLabel:["Space"],type:"structure",isDeleted:false,createdAt:"${moment().format('YYYY-MM-DD HH:mm:ss')}",canDelete:true, urlType:"POST"}) \
  SET spc+={url:"${urlStructure}"}  \
  MERGE (t)-[:PARENT_OF {isDeleted:false}]->(c) \
  MERGE (c)-[:HAS_VIRTUAL_RELATION {isDeleted:false}]->(wgp) MERGE (c)-[:WARRANTY_GUARANTOR_PARTS_BY {isDeleted:false}]->(wgp) \
  MERGE (c)-[:HAS_VIRTUAL_RELATION {isDeleted:false}]->(wgl) MERGE (c)-[:WARRANTY_GUARANTOR_LABOR_BY {isDeleted:false}]->(wgl) \
  MERGE (c)-[:HAS_VIRTUAL_RELATION {isDeleted:false}]->(cnt) MERGE (c)-[:CREATED_BY {isDeleted:false}]->(cnt) \
  MERGE (c)-[:HAS_VIRTUAL_RELATION {isDeleted:false}]->(spc) MERGE (c)-[:LOCATED_IN {isDeleted:false}]->(spc);`

    await this.write(cypher);

 } catch (error) {
  throw new HttpException(error,500);
 }
 
}

  async createSystem(realm:string,data:string[],creatingCypher:string,createdCypher:string,emailData:string){
  try {
    if(data[2] && data[3]){
      let cyphertype= `MATCH (tt:Types {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(t:Type {name:"${data[3]}",isDeleted:false}) return t;`
        let typeNode= await this.read(cyphertype);
      
        let systemCypher =`MATCH (sys:Systems {realm:"${realm}"}) ${creatingCypher} \
        MATCH (t:Type {key:"${typeNode.records[0]["_fields"][0].properties.key}"}) \
        ${await this.getSubSystemFromDb(realm,data)} \
        MERGE (s)-[:TYPE_OF_SYSTEM {isDeleted:false}]->(t) \
        ${emailData}  \
        ${createdCypher}`;
        await this.write(systemCypher);
      }
      else if (data[2] && data[7]){
        let systemCypher =`MATCH (sys:Systems {realm:"${realm}"}) ${creatingCypher} \
        MATCH (comp:Component {name:"${data[7]}",isDeleted:false}) \
        ${await this.getSubSystemFromDb(realm,data)} \
        MERGE (s)-[:SYSTEM_OF {isDeleted:false}]->(comp) \
        ${emailData}  \
        ${createdCypher}`;
      
        await this.write(systemCypher);
      }else if (data[3]){
      
        let cyphertype= `MATCH (tt:Types {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(t:Type {name:"${data[3]}",isDeleted:false}) return t;`
        let typeNode= await this.read(cyphertype);
        let systemCypher =`MATCH (sys:Systems {realm:"${realm}"}) ${creatingCypher} MATCH (t:Type {key:"${typeNode.records[0]["_fields"][0].properties.key}"}) \
        ${await this.getSystemFromDb(realm,data)} \
        MERGE (s)-[:TYPE_OF_SYSTEM {isDeleted:false}]->(t) \
        ${emailData}  \
        ${createdCypher}`;
      
        await this.write(systemCypher);
      }
      else {
        let systemCypher =`MATCH (sys:Systems {realm:"${realm}"}) ${creatingCypher} \
        MATCH (comp:Component {name:"${data[7]}",isDeleted:false}) \
        ${await this.getSystemFromDb(realm,data)} \
        MERGE (s)-[:SYSTEM_OF {isDeleted:false}]->(comp) \
        ${emailData}  \
        ${createdCypher}`;
      
        await this.write(systemCypher);
      }
} catch (error) {
  throw new HttpException(error,500);
}   
  }

  async getSystemFromDb(realm: string, data: string[]) {
    try {
      let cypher = `MATCH (a:Systems {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(n:System {name:"${data[1]}",isDeleted:false}) return n;`;
      let returnData = await this.read(cypher);
  
      if (returnData.records?.length == 1) {
        return `MATCH (s:System {key:"${returnData.records[0]["_fields"][0].properties.key}",isDeleted:false})`;
      } else {
        return `MERGE (s:System {name:"${data[1]}",createdAt:"${
          data[5]
        }",externalSystem:"${data[8]}",externalObject:"${
          data[9]
        }",externalIdentifier:"${data[10]}",description:"${
          data[11]
        }",images:"",documents:"",tag:[],key:"${this.keyGenerate()}",isDeleted:false,canDelete:true,isActive:true,className:"System"})
      MERGE (sys)-[:PARENT_OF {isDeleted:false}]->(s)`;
      }
    } catch (error) {
      throw new HttpException(error,500);
    }
   
  }

  async getSubSystemFromDb(realm: string,data: string[]){
    try {
      let cypher = `MATCH (s:Systems {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(n:System {name:"${data[2]}",isDeleted:false})-[:PARENT_OF* {isDeleted:false}]->(m:System {name:"${data[1]}",isDeleted:false}) return m;`;
      let returnData = await this.read(cypher);

      if (returnData.records.length == 1) {
        return `MATCH (s:System {key:"${returnData.records[0]["_fields"][0].properties.key}",isDeleted:false})`;
      } else {
        return `MATCH (sys)-[:PARENT_OF {isDeleted:false}]->(ss:System {name:"${data[2]}",isDeleted:false}) MERGE (s:System {name:"${data[1]}",createdAt:"${
          data[5]
        }",externalSystem:"${data[8]}",externalObject:"${
          data[9]
        }",externalIdentifier:"${data[10]}",description:"${
          data[11]
        }",images:"",documents:"",tag:[],key:"${this.keyGenerate()}",isDeleted:false,canDelete:true,isActive:true,className:"System"}) \
      MERGE (ss)-[:PARENT_OF {isDeleted:false}]->(s)`;
      }
    } catch (error) {
      throw new HttpException(error,500);
    }
}

  // HTTP REQUESTS

  async getPropsOfContact(email: string, headers: MainHeaderInterface) {
    try {
      let { realm } = headers;
      let cypher = `MATCH (n:Contacts {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(p:Contact {email:"${email}",isDeleted:false}) return p`;
      let data = await this.read(cypher);
      let result ={key:data.records[0]["_fields"][0].properties.key,id:data.records[0]["_fields"][0].identity.low};
      return result;
    } catch (error) {
      throw new HttpException(error,500);
    }
  }

  async getPropsOfSpace(
    locationCode: string,
    buildingKey: string,
    headers: MainHeaderInterface
  ) {
    try {
      let { realm } = headers;

      let cypher = `MATCH (n:FacilityStructure {realm:"${realm}"})-[:PARENT_OF {isDeleted:false}]->(b:Building {key:"${buildingKey}"})-[:PARENT_OF* {isDeleted:false}]->(s:Space {code:"${locationCode}",isDeleted:false}) return s`;

      let data = await this.read(cypher);
      let object={id:data.records[0]['_fields'][0].identity.low,key:data.records[0]["_fields"][0].properties.key,name:data.records[0]["_fields"][0].properties.name};
      return object;
    } catch (error) {
      throw new HttpException(error,500);
    }
  }


  ///// COMMON FUNCTIONS
  keyGenerate() {
    return uuidv4();
  }

  getValueFromRichText = async (datas: any[]) => {
    try {
      let returningDatas: string[] = [];

      for (let i = 0; i < datas.length; i++) {
        if (typeof datas[i] == "object") {
          returningDatas.push(datas[i].text);
        } else {
          returningDatas.push(datas[i]);
        }
      }
      return returningDatas;
    } catch (error) {
      throw new HttpException(error,500);
    }
   
  };
}
